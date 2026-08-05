import { getConfig } from '@musearr/config'
import { MUSEARR_VERSION } from '@musearr/core'
import {
  createDatabase,
  DAILY_BRIEF_QUEUE,
  getDatabaseStatus,
  getOwnerUserIds,
  getLibrarySyncSources,
  LIBRARY_SYNC_QUEUE,
  PLAYLIST_SYNC_QUEUE,
  RECOMMENDATION_RUN_QUEUE,
  RECONCILIATION_QUEUE,
  scheduleLibraryReconciliation,
  scheduleDailyBrief,
  startJobQueue,
  type LibrarySyncJob,
  type DailyBriefJob,
  type PlaylistSyncJob,
  type RecommendationRunJob,
  type ReconciliationJob,
} from '@musearr/db'
import type { PgBoss } from 'pg-boss'
import { syncPlexLibrary } from './jobs/library-sync.js'
import { syncPlexPlaylists } from './jobs/playlist-sync.js'
import { generateRecommendationRun } from './jobs/recommendation-run.js'
import { generateDailyBrief } from './jobs/daily-brief.js'

const config = getConfig()
const database = createDatabase(config.DATABASE_URL)
let jobQueue: PgBoss | null = null

async function start(): Promise<void> {
  const status = await getDatabaseStatus(database)
  if (status !== 'connected') {
    console.error('Musearr worker cannot reach PostgreSQL.')
    process.exitCode = 1
    await database.end({ timeout: 5 })
    return
  }

  jobQueue = await startJobQueue(config.DATABASE_URL, (error) => {
    console.error('Musearr worker queue error.', error)
  })
  await jobQueue.work<LibrarySyncJob>(LIBRARY_SYNC_QUEUE, { batchSize: 1, localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const result = await syncPlexLibrary(
        database,
        config.MUSEARR_ENCRYPTION_KEY,
        job.data.librarySectionId,
        job.data.trigger,
      )
      console.info({ jobId: job.id, ...result }, 'Plex library sync completed')
    }
  })
  await jobQueue.work<ReconciliationJob>(
    RECONCILIATION_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const sources = await getLibrarySyncSources(database)
        const jobIds = await Promise.all(
          sources.map((source) =>
            jobQueue!.send(
              LIBRARY_SYNC_QUEUE,
              { librarySectionId: source.librarySectionId, trigger: 'reconciliation' },
              {
                singletonKey: source.librarySectionId,
                singletonSeconds: config.MUSEARR_RECONCILIATION_INTERVAL_MINUTES * 60,
              },
            ),
          ),
        )
        const playlistJobIds = await Promise.all(
          [...new Set(sources.map((source) => source.plexServerId))].map((plexServerId) =>
            jobQueue!.send(
              PLAYLIST_SYNC_QUEUE,
              { plexServerId, trigger: 'reconciliation' },
              {
                singletonKey: plexServerId,
                singletonSeconds: config.MUSEARR_RECONCILIATION_INTERVAL_MINUTES * 60,
              },
            ),
          ),
        )
        console.info(
          { jobId: job.id, trigger: job.data.trigger, libraryCount: sources.length, jobIds, playlistJobIds },
          'Plex reconciliation queued',
        )
      }
    },
  )
  await jobQueue.work<PlaylistSyncJob>(
    PLAYLIST_SYNC_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const result = await syncPlexPlaylists(
          database,
          config.MUSEARR_ENCRYPTION_KEY,
          job.data.plexServerId,
        )
        console.info({ jobId: job.id, ...result }, 'Plex playlist sync completed')
      }
    },
  )
  await jobQueue.work<RecommendationRunJob>(
    RECOMMENDATION_RUN_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const result = await generateRecommendationRun(
          database,
          job.data.userId,
          job.data.kind,
          job.data.limit,
        )
        console.info({ jobId: job.id, ...result }, 'Recommendation run completed')
      }
    },
  )

  await jobQueue.work<DailyBriefJob>(
    DAILY_BRIEF_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const userIds = job.data.userId ? [job.data.userId] : await getOwnerUserIds(database)
        for (const userId of userIds) {
          const result = await generateDailyBrief(database, userId, {
            timezone: config.MUSEARR_TIMEZONE,
            ...(config.MUSEARR_DISCORD_WEBHOOK_URL
              ? { discordWebhookUrl: config.MUSEARR_DISCORD_WEBHOOK_URL }
              : {}),
          })
          console.info(
            { jobId: job.id, userId, created: result.created, delivered: result.delivered },
            'Daily briefing completed',
          )
        }
      }
    },
  )

  await scheduleLibraryReconciliation(jobQueue, config.MUSEARR_RECONCILIATION_INTERVAL_MINUTES)
  await scheduleDailyBrief(jobQueue, config.MUSEARR_DAILY_BRIEF_TIME, config.MUSEARR_TIMEZONE)

  console.info(
    `Musearr worker ${MUSEARR_VERSION} is ready for durable Plex sync jobs, ${config.MUSEARR_RECONCILIATION_INTERVAL_MINUTES}-minute reconciliation, and daily briefings at ${config.MUSEARR_DAILY_BRIEF_TIME} ${config.MUSEARR_TIMEZONE}.`,
  )
}

async function stop(signal: string): Promise<void> {
  console.info(`Stopping Musearr worker after ${signal}.`)
  await jobQueue?.stop()
  await database.end({ timeout: 5 })
}

process.on('SIGINT', () => void stop('SIGINT'))
process.on('SIGTERM', () => void stop('SIGTERM'))

void start()
