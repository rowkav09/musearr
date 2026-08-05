import { getConfig } from '@musearr/config'
import { MUSEARR_VERSION } from '@musearr/core'
import {
  createDatabase,
  getDatabaseStatus,
  LIBRARY_SYNC_QUEUE,
  RECOMMENDATION_RUN_QUEUE,
  startJobQueue,
  type LibrarySyncJob,
  type RecommendationRunJob,
} from '@musearr/db'
import type { PgBoss } from 'pg-boss'
import { syncPlexLibrary } from './jobs/library-sync.js'
import { generateRecommendationRun } from './jobs/recommendation-run.js'

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
      const result = await syncPlexLibrary(database, config.MUSEARR_ENCRYPTION_KEY, job.data.librarySectionId)
      console.info({ jobId: job.id, ...result }, 'Plex library sync completed')
    }
  })
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

  console.info(`Musearr worker ${MUSEARR_VERSION} is ready for durable Plex sync jobs.`)
}

async function stop(signal: string): Promise<void> {
  console.info(`Stopping Musearr worker after ${signal}.`)
  await jobQueue?.stop()
  await database.end({ timeout: 5 })
}

process.on('SIGINT', () => void stop('SIGINT'))
process.on('SIGTERM', () => void stop('SIGTERM'))

void start()
