import { PgBoss } from 'pg-boss'

export const LIBRARY_SYNC_QUEUE = 'library.sync'
export const PLAYLIST_SYNC_QUEUE = 'playlist.sync'
export const RECONCILIATION_QUEUE = 'library.reconcile'
export const RECOMMENDATION_RUN_QUEUE = 'recommendation.run'
export const DAILY_BRIEF_QUEUE = 'daily-brief.generate'
export const PLAYLIST_GENERATION_QUEUE = 'playlist.generate'
export const PLAYLIST_ACQUISITION_QUEUE = 'playlist.acquire'
export const PLAYLIST_PUBLISH_QUEUE = 'playlist.publish'
export const PLAYLIST_GENERATION_RECONCILE_QUEUE = 'playlist.generate.reconcile'
export const PLAYLIST_CURATION_QUEUE = 'playlist.curate'
export const PLAYLIST_CURATION_APPLY_QUEUE = 'playlist.curate.apply'
export const PLAYLIST_IDEAS_SCAN_QUEUE = 'playlist.ideas.scan'
export const PLAYLIST_IDEA_CREATE_QUEUE = 'playlist.idea.create'
const RECONCILIATION_SCHEDULE_KEY = 'default'
const DAILY_BRIEF_SCHEDULE_KEY = 'default'
const PLAYLIST_GENERATION_RECONCILE_SCHEDULE_KEY = 'default'
/** How often the reconciler advances awaiting-acquisition generations. */
const PLAYLIST_GENERATION_RECONCILE_CRON = '*/10 * * * *'

export type LibrarySyncJob = {
  librarySectionId: string
  trigger: 'initial-setup' | 'manual' | 'webhook' | 'reconciliation'
}

export type ReconciliationJob = {
  trigger: 'scheduled'
}

export type PlaylistSyncJob = {
  plexServerId: string
  trigger: 'initial-setup' | 'reconciliation'
}

export type RecommendationRunJob = {
  userId: string
  kind: 'daily_mix' | 'forgotten_favourites' | 'hidden_gems' | 'recently_added'
  limit: number
  trigger: 'manual' | 'scheduled'
}

export type DailyBriefJob = {
  trigger: 'manual' | 'scheduled'
  userId?: string
}

export type PlaylistGenerationJob = {
  generationId: string
  trigger: 'manual'
}

export type PlaylistAcquisitionJob = {
  generationId: string
}

export type PlaylistPublishJob = {
  generationId: string
  trigger: 'manual' | 'reconciliation'
}

export type PlaylistGenerationReconcileJob = {
  trigger: 'scheduled'
}

export type PlaylistCurationJob = {
  curationId: string
  trigger: 'manual'
}

export type PlaylistCurationApplyJob = {
  curationId: string
  trigger: 'manual'
}

export type PlaylistIdeasScanJob = {
  userId: string
  trigger: 'manual'
}

export type PlaylistIdeaCreateJob = {
  userId: string
  ideaId: string
  trigger: 'manual'
}

export function reconciliationCron(intervalMinutes: number): string {
  if (intervalMinutes === 1_440) {
    return '0 0 * * *'
  }
  if (intervalMinutes < 60 && 60 % intervalMinutes === 0) {
    return `*/${intervalMinutes} * * * *`
  }
  if (intervalMinutes >= 60 && intervalMinutes < 1_440 && intervalMinutes % 60 === 0) {
    return `0 */${intervalMinutes / 60} * * *`
  }
  throw new Error(`Unsupported reconciliation interval: ${intervalMinutes} minutes.`)
}

export function dailyBriefCron(time: string): string {
  const match = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/.exec(time)
  if (!match?.groups) {
    throw new Error(`Unsupported daily briefing time: ${time}.`)
  }
  return `${Number(match.groups.minute)} ${Number(match.groups.hour)} * * *`
}

export async function scheduleLibraryReconciliation(
  jobQueue: Pick<PgBoss, 'schedule'>,
  intervalMinutes: number,
): Promise<void> {
  await jobQueue.schedule(
    RECONCILIATION_QUEUE,
    reconciliationCron(intervalMinutes),
    { trigger: 'scheduled' },
    { key: RECONCILIATION_SCHEDULE_KEY, tz: 'UTC' },
  )
}

export async function scheduleDailyBrief(
  jobQueue: Pick<PgBoss, 'schedule'>,
  time: string,
  timezone: string,
): Promise<void> {
  await jobQueue.schedule(
    DAILY_BRIEF_QUEUE,
    dailyBriefCron(time),
    { trigger: 'scheduled' },
    { key: DAILY_BRIEF_SCHEDULE_KEY, tz: timezone },
  )
}

export async function schedulePlaylistGenerationReconcile(
  jobQueue: Pick<PgBoss, 'schedule'>,
): Promise<void> {
  await jobQueue.schedule(
    PLAYLIST_GENERATION_RECONCILE_QUEUE,
    PLAYLIST_GENERATION_RECONCILE_CRON,
    { trigger: 'scheduled' },
    { key: PLAYLIST_GENERATION_RECONCILE_SCHEDULE_KEY, tz: 'UTC' },
  )
}

export async function startJobQueue(
  databaseUrl: string,
  onError: (error: Error) => void,
): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl)
  boss.on('error', onError)
  await boss.start()
  await boss.createQueue(LIBRARY_SYNC_QUEUE, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 3_600,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  await boss.createQueue(PLAYLIST_SYNC_QUEUE, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 3_600,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  await boss.createQueue(RECONCILIATION_QUEUE, {
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  await boss.createQueue(RECOMMENDATION_RUN_QUEUE, {
    retryLimit: 2,
    retryDelay: 15,
    retryBackoff: true,
    expireInSeconds: 300,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  await boss.createQueue(DAILY_BRIEF_QUEUE, {
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 600,
    retentionSeconds: 30 * 24 * 60 * 60,
  })
  await boss.createQueue(PLAYLIST_GENERATION_QUEUE, {
    retryLimit: 2,
    retryDelay: 15,
    retryBackoff: true,
    expireInSeconds: 600,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  await boss.createQueue(PLAYLIST_ACQUISITION_QUEUE, {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 900,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  await boss.createQueue(PLAYLIST_PUBLISH_QUEUE, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 600,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  await boss.createQueue(PLAYLIST_GENERATION_RECONCILE_QUEUE, {
    retryLimit: 1,
    retryDelay: 30,
    expireInSeconds: 600,
    retentionSeconds: 7 * 24 * 60 * 60,
  })
  await boss.createQueue(PLAYLIST_CURATION_QUEUE, {
    retryLimit: 2,
    retryDelay: 15,
    retryBackoff: true,
    expireInSeconds: 600,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  await boss.createQueue(PLAYLIST_CURATION_APPLY_QUEUE, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 600,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  await boss.createQueue(PLAYLIST_IDEAS_SCAN_QUEUE, {
    retryLimit: 1,
    retryDelay: 15,
    expireInSeconds: 600,
    retentionSeconds: 7 * 24 * 60 * 60,
  })
  await boss.createQueue(PLAYLIST_IDEA_CREATE_QUEUE, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 600,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  return boss
}
