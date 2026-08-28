import {
  beginRecommendationRun,
  completeRecommendationRun,
  failRecommendationRun,
  getRecommendationCandidates,
  type Database,
  type PersistedRecommendation,
  type RecommendationKind,
} from '@musearr/db'
import {
  phraseRecommendationSummaries,
  rankRecommendations,
  RECOMMENDATION_ALGORITHM_VERSION,
} from '@musearr/intelligence'
import { resolveLocalAiProvider } from '../local-ai.js'

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
    const candidateById = new Map(candidates.map((candidate) => [candidate.trackId, candidate]))

    // Optional: rephrase the deterministic reason sentence with Local AI. The
    // score, ordering, and structured reasons are untouched; any failure keeps
    // the deterministic wording.
    const phrased: PersistedRecommendation['summaryPhrasing'][] = ranked.map(() => 'deterministic')
    try {
      const ai = await resolveLocalAiProvider(database)
      if (ai.enabled) {
        const results = await phraseRecommendationSummaries(
          ai,
          ranked.map((recommendation) => {
            const candidate = candidateById.get(recommendation.trackId)
            return {
              trackTitle: candidate?.trackTitle ?? 'this track',
              artistName: candidate?.artistName ?? 'this artist',
              albumTitle: candidate?.albumTitle ?? '',
              kind,
              summary: recommendation.summary,
              reasons: recommendation.reasons,
            }
          }),
        )
        ranked.forEach((recommendation, index) => {
          const result = results[index]
          if (result) {
            recommendation.summary = result.summary
            phrased[index] = result.phrasing
          }
        })
      }
    } catch {
      // Local AI is best-effort here; the deterministic wording already stands.
    }

    await completeRecommendationRun(
      database,
      runId,
      ranked.map((recommendation, index) => ({
        trackId: recommendation.trackId,
        rank: index + 1,
        score: recommendation.score,
        reasons: recommendation.reasons,
        summary: recommendation.summary,
        summaryPhrasing: phrased[index] ?? 'deterministic',
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
