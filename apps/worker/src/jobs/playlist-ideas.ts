import type { MusearrConfig } from '@musearr/config'
import { decryptSecret } from '@musearr/core'
import {
  getAllPlaylistedTrackIds,
  getLibrarySyncSources,
  getPlaylistIdea,
  getPlaylistLibraryTracks,
  replacePlaylistIdeas,
  setPlaylistIdeaStatus,
  type Database,
} from '@musearr/db'
import {
  ideaMatchesTrack,
  namePlaylistIdeas,
  PLAYLIST_IDEAS_ALGORITHM_VERSION,
  proposePlaylistIdeas,
  type IdeaFilter,
} from '@musearr/intelligence'
import { PlexClient } from '@musearr/plex'
import { resolveLocalAiProvider } from '../local-ai.js'

export type PlaylistIdeasScanOutcome = { userId: string; proposed: number; aiUsed: boolean }
export type PlaylistIdeaCreateOutcome = {
  created: boolean
  tracks: number
  plexRatingKey: string | null
}

export async function scanPlaylistIdeas(
  database: Database,
  userId: string,
): Promise<PlaylistIdeasScanOutcome> {
  const library = await getPlaylistLibraryTracks(database, userId)
  const playlisted = new Set(await getAllPlaylistedTrackIds(database))
  const ideas = proposePlaylistIdeas(library, playlisted)

  const ai = await resolveLocalAiProvider(database)
  const named = ai.enabled ? await namePlaylistIdeas(ai, ideas) : ideas
  const aiUsed = named.some((idea, index) => idea.name !== ideas[index]?.name)

  await replacePlaylistIdeas(
    database,
    userId,
    named.map((idea) => ({
      name: idea.name,
      rationale: idea.rationale,
      kind: idea.kind,
      filter: idea.filter,
      libraryTrackCount: idea.libraryTrackCount,
      coveredTrackCount: idea.coveredTrackCount,
      coverageRatio: idea.coverageRatio,
      score: idea.score,
      source: aiUsed ? 'local_ai' : 'deterministic',
    })),
    PLAYLIST_IDEAS_ALGORITHM_VERSION,
  )
  return { userId, proposed: named.length, aiUsed }
}

export async function createPlaylistFromIdea(
  database: Database,
  config: MusearrConfig,
  userId: string,
  ideaId: string,
): Promise<PlaylistIdeaCreateOutcome> {
  const idea = await getPlaylistIdea(database, userId, ideaId)
  if (!idea) {
    throw new Error('The playlist idea no longer exists.')
  }
  if (idea.status === 'created') {
    return { created: false, tracks: 0, plexRatingKey: null }
  }
  if (!config.MUSEARR_ENCRYPTION_KEY) {
    throw new Error('MUSEARR_ENCRYPTION_KEY is required before a Plex playlist can be written.')
  }

  const library = await getPlaylistLibraryTracks(database, userId)
  const matched = library.filter((track) => ideaMatchesTrack(track, idea.filter as IdeaFilter))
  if (matched.length === 0) {
    throw new Error('No library tracks match this idea any more.')
  }

  const [source] = await getLibrarySyncSources(database)
  if (!source) {
    throw new Error('No Plex library is connected.')
  }

  const client = new PlexClient(
    source.baseUrl,
    decryptSecret(source.tokenCiphertext, config.MUSEARR_ENCRYPTION_KEY),
  )
  const { plexRatingKey } = await client.createAudioPlaylist(
    source.machineIdentifier,
    idea.name,
    matched.map((track) => track.plexRatingKey).slice(0, 500),
  )
  await setPlaylistIdeaStatus(database, userId, ideaId, 'created')
  return { created: true, tracks: matched.length, plexRatingKey }
}
