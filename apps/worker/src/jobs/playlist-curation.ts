import {
  proposeCurationAdditions,
  rerankCurationWithAi,
  type CurationProposalItem,
} from '@musearr/intelligence'
import {
  getCurationJobContext,
  getPlaylistLibraryTracks,
  getPlaylistTrackIds,
  replaceCurationItems,
  setCurationStatus,
  type Database,
} from '@musearr/db'
import { resolveLocalAiProvider } from '../local-ai.js'

export type CurationOutcome = {
  curationId: string
  proposed: number
  aiUsed: boolean
}

export async function proposeCuration(
  database: Database,
  curationId: string,
): Promise<CurationOutcome> {
  const context = await getCurationJobContext(database, curationId)
  if (!context) {
    throw new Error('The curation no longer exists.')
  }

  try {
    if (!context.playlistId) {
      await setCurationStatus(
        database,
        curationId,
        'failed',
        'That playlist is not in the local mirror yet. Run a playlist sync and try again.',
      )
      return { curationId, proposed: 0, aiUsed: false }
    }

    const library = await getPlaylistLibraryTracks(database, context.userId)
    const basisIds = new Set(await getPlaylistTrackIds(database, context.playlistId))
    const basis = library.filter((track) => basisIds.has(track.trackId))
    if (basis.length === 0) {
      await setCurationStatus(
        database,
        curationId,
        'failed',
        'That playlist has no mirrored tracks to learn from yet.',
      )
      return { curationId, proposed: 0, aiUsed: false }
    }

    const proposal = proposeCurationAdditions(basis, library, {
      limit: context.requestedLimit,
      shortlistFactor: context.useAi ? 2 : 1,
    })

    let items: CurationProposalItem[] = proposal.items.slice(0, context.requestedLimit)
    let aiUsed = false
    if (context.useAi && proposal.items.length > 1) {
      const ai = await resolveLocalAiProvider(database)
      if (ai.enabled) {
        const rerank = await rerankCurationWithAi(ai, {
          playlistName: context.playlistName,
          topArtists: topBy(basis, (track) => track.artistName, 4),
          topGenres: topBy(basis, (track) => track.genres, 4),
          shortlist: proposal.items,
          limit: context.requestedLimit,
        })
        items = rerank.items
        aiUsed = rerank.aiUsed
      }
    }

    await replaceCurationItems(
      database,
      curationId,
      items.map((item, index) => ({
        position: index,
        trackId: item.trackId,
        plexRatingKey: item.plexRatingKey,
        artistName: item.artistName,
        trackTitle: item.trackTitle,
        score: item.score,
        reasonCodes: item.reasons,
      })),
      { aiUsed, basisTrackCount: basis.length, algorithmVersion: proposal.algorithmVersion },
    )

    return { curationId, proposed: items.length, aiUsed }
  } catch (error) {
    await setCurationStatus(
      database,
      curationId,
      'failed',
      error instanceof Error ? error.message : 'Unknown curation error',
    )
    throw error
  }
}

function topBy<T>(rows: T[], pick: (row: T) => string | string[], n: number): string[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = pick(row)
    for (const raw of Array.isArray(value) ? value : [value]) {
      const key = raw.trim()
      if (key) {
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, n)
    .map(([key]) => key)
}
