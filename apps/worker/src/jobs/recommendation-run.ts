import {
  beginRecommendationRun,
  completeRecommendationRun,
  failRecommendationRun,
  getRecommendationCandidates,
  type Database,
  type RecommendationKind,
} from '@musearr/db'
import {
  rankRecommendations,
  RECOMMENDATION_ALGORITHM_VERSION,
} from '@musearr/intelligence'

export async function generateRecommendationRun(
  database: Database,
  userId: string,
  kind: RecommendationKind,
  limit: number,
): Promise<{ runId: string; recommendationCount: number }> {
  const candidates = await getRecommendationCandidates(database, userId)
  const runId = await beginRecommendationRun(
    database,
    userId,
    kind,
    RECOMMENDATION_ALGORITHM_VERSION,
  )

  try {
    const ranked = rankRecommendations(candidates, kind, { limit })
    await completeRecommendationRun(
      database,
      runId,
      ranked.map((recommendation, index) => ({
        trackId: recommendation.trackId,
        rank: index + 1,
        score: recommendation.score,
        reasons: recommendation.reasons,
        summary: recommendation.summary,
      })),
    )
    return { runId, recommendationCount: ranked.length }
  } catch (error) {
    await failRecommendationRun(
      database,
      runId,
      error instanceof Error ? error.message : 'Unknown recommendation error',
    )
    throw error
  }
}
