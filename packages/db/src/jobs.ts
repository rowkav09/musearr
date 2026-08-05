import { PgBoss } from 'pg-boss'

export const LIBRARY_SYNC_QUEUE = 'library.sync'
export const RECOMMENDATION_RUN_QUEUE = 'recommendation.run'

export type LibrarySyncJob = {
  librarySectionId: string
  trigger: 'initial-setup' | 'manual' | 'reconciliation'
}

export type RecommendationRunJob = {
  userId: string
  kind: 'daily_mix' | 'forgotten_favourites' | 'hidden_gems' | 'recently_added'
  limit: number
  trigger: 'manual' | 'scheduled'
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
  await boss.createQueue(RECOMMENDATION_RUN_QUEUE, {
    retryLimit: 2,
    retryDelay: 15,
    retryBackoff: true,
    expireInSeconds: 300,
    retentionSeconds: 14 * 24 * 60 * 60,
  })
  return boss
}
