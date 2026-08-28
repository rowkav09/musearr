import type { MusearrConfig } from '@musearr/config'
import { decryptSecret } from '@musearr/core'
import {
  getLibrarySyncSources,
  getPlaylistLibraryTracks,
  listGenres,
  type Database,
} from '@musearr/db'
import { ideaMatchesTrack, promptToPlaylistFilter, type IdeaFilter } from '@musearr/intelligence'
import { PlexClient } from '@musearr/plex'
import { resolveLocalAiProvider } from '../local-ai.js'
import { curateIdeaSelection } from './playlist-ideas.js'

export type PlaylistBuildOutcome = { tracks: number; plexRatingKey: string; aiUsed: boolean }

/**
 * Builds a Plex playlist from a filter (a genre / decade / OR of several) or,
 * when local AI is on, from a free-text request that AI turns into such a
 * filter. Library-only: it ranks the matching tracks, caps per artist, and
 * creates a new Musearr playlist.
 */
export async function buildPlaylistFromFilter(
  database: Database,
  config: MusearrConfig,
  input: { userId: string; name: string; size: number; filter?: IdeaFilter; prompt?: string },
): Promise<PlaylistBuildOutcome> {
  if (!config.MUSEARR_ENCRYPTION_KEY) {
    throw new Error('MUSEARR_ENCRYPTION_KEY is required before a Plex playlist can be written.')
  }

  let filter = input.filter ?? null
  let aiUsed = false
  if (!filter && input.prompt) {
    const ai = await resolveLocalAiProvider(database)
    if (!ai.enabled) {
      throw new Error('A free-text request needs local AI to be enabled in Settings.')
    }
    const genres = (await listGenres(database)).map((genre) => genre.name)
    filter = await promptToPlaylistFilter(ai, input.prompt, genres)
    if (!filter) {
      throw new Error('Local AI could not turn that request into anything in your library.')
    }
    aiUsed = true
  }
  if (!filter) {
    throw new Error('Give a genre, a decade, or a description.')
  }

  const library = await getPlaylistLibraryTracks(database, input.userId)
  const matched = library.filter((track) => ideaMatchesTrack(track, filter as IdeaFilter))
  if (matched.length === 0) {
    throw new Error('No tracks in your library match that.')
  }

  const [source] = await getLibrarySyncSources(database)
  if (!source) {
    throw new Error('No Plex library is connected.')
  }

  const target = Math.min(200, Math.max(1, Math.round(input.size)))
  const selected = curateIdeaSelection(matched, target, target <= 25 ? 2 : 3)

  const client = new PlexClient(
    source.baseUrl,
    decryptSecret(source.tokenCiphertext, config.MUSEARR_ENCRYPTION_KEY),
  )
  const { plexRatingKey } = await client.createAudioPlaylist(
    source.machineIdentifier,
    input.name,
    selected.map((track) => track.plexRatingKey),
  )
  return { tracks: selected.length, plexRatingKey, aiUsed }
}
