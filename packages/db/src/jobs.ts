import { PgBoss } from 'pg-boss'

export const LIBRARY_SYNC_QUEUE = 'library.sync'
export const RECONCILIATION_QUEUE = 'library.reconcile'
export const RECOMMENDATION_RUN_QUEUE = 'recommendation.run'
const RECONCILIATION_SCHEDULE_KEY = 'default'

export type LibrarySyncJob = {
  librarySectionId: string
  trigger: 'initial-setup' | 'manual' | 'webhook' | 'reconciliation'
}

export type ReconciliationJob = {
  trigger: 'scheduled'
}

export type RecommendationRunJob = {
  userId: string
  kind: 'daily_mix' | 'forgotten_favourites' | 'hidden_gems' | 'recently_added'
  limit: number
  trigger: 'manual' | 'scheduled'
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
  return boss
}
