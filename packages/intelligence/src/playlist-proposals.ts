import {
  RECOMMENDATION_ALGORITHM_VERSION,
  rankRecommendations,
  type RecommendationCandidate,
  type RecommendationKind,
} from './ranking.js'

export type PlaylistProposalDraft = {
  title: string
  kind: RecommendationKind
  algorithmVersion: string
  trackIds: string[]
}

export function generatePlaylistProposalDraft(
  candidates: RecommendationCandidate[],
  kind: RecommendationKind,
  options: { title?: string; limit?: number; now?: Date } = {},
): PlaylistProposalDraft {
  const limit = Math.max(5, Math.min(100, Math.floor(options.limit ?? 20)))
  const rankOptions: { limit: number; now?: Date } = { limit }
  if (options.now) {
    rankOptions.now = options.now
  }
  const ranked = rankRecommendations(candidates, kind, rankOptions)
  const trackIds = ranked.map((r) => r.trackId)

  const defaultTitle = getDefaultTitle(kind)
  const title = options.title?.trim() || defaultTitle

  return {
    title,
    kind,
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    trackIds,
  }
}

function getDefaultTitle(kind: RecommendationKind): string {
  switch (kind) {
    case 'forgotten_favourites':
      return 'Forgotten Favourites Flow'
    case 'hidden_gems':
      return 'Hidden Gems Selection'
    case 'recently_added':
      return 'Fresh Additions Mix'
    case 'daily_mix':
    default:
      return 'Daily Listening Proposal'
  }
}
