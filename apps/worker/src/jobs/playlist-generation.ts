import type { MusearrConfig } from '@musearr/config'
import { MUSEARR_VERSION } from '@musearr/core'
import {
  getPlaylistGenerationJobContext,
  getPlaylistLibraryTracks,
  replacePlaylistGenerationItems,
  setPlaylistGenerationStatus,
  type Database,
  type PlaylistGenerationItemInput,
} from '@musearr/db'
import {
  CompositeSimilarTrackProvider,
  createLocalAiProvider,
  generateFromSeed,
  LocalAiSimilarTrackProvider,
  NullSimilarTrackProvider,
  PLAYLIST_ALGORITHM_VERSION,
  type ExternalTrackSuggestion,
  type SimilarTrackProvider,
} from '@musearr/intelligence'
import { MusicBrainzSimilarTrackProvider } from '@musearr/musicbrainz'

export type PlaylistGenerationOutcome = {
  inLibrary: number
  gaps: number
  next: 'acquire' | 'publish' | 'done'
}

export async function generatePlaylist(
  database: Database,
  config: MusearrConfig,
  generationId: string,
): Promise<PlaylistGenerationOutcome> {
  const context = await getPlaylistGenerationJobContext(database, generationId)
  if (!context) {
    throw new Error('The playlist generation no longer exists.')
  }
  if (!context.seedTrackId) {
    throw new Error('The seed track is no longer in the library.')
  }

  const library = await getPlaylistLibraryTracks(database, context.userId)
  const seed = library.find((track) => track.trackId === context.seedTrackId)
  if (!seed) {
    throw new Error('The seed track is no longer in the library.')
  }

  const similar = resolveSimilarTrackProvider(config, context.acquireMissing)
  const suggestions: ExternalTrackSuggestion[] = context.acquireMissing
    ? await similar.findSimilar(
        {
          artistName: seed.artistName,
          trackTitle: seed.trackTitle,
          albumTitle: seed.albumTitle,
          genres: seed.genres,
        },
        context.targetSize,
      )
    : []

  const plan = generateFromSeed(seed, library, {
    targetSize: context.targetSize,
    externalSuggestions: suggestions,
  })

  const items: PlaylistGenerationItemInput[] = plan.items.map((item) => ({
    position: item.position,
    trackId: item.trackId,
    plexRatingKey: item.plexRatingKey,
    artistName: item.artistName,
    albumTitle: item.albumTitle,
    trackTitle: item.trackTitle,
    state: item.inLibrary ? 'in_library' : 'pending',
    score: item.score,
    reasonCodes: item.reasons,
  }))
  await replacePlaylistGenerationItems(database, generationId, items, PLAYLIST_ALGORITHM_VERSION)

  const gaps = plan.gapCount
  if (gaps > 0 && context.acquireMissing) {
    await setPlaylistGenerationStatus(database, generationId, 'awaiting_acquisition')
    return { inLibrary: plan.inLibraryCount, gaps, next: 'acquire' }
  }

  if (context.publishToPlex && plan.inLibraryCount > 0) {
    await setPlaylistGenerationStatus(database, generationId, 'ready')
    return { inLibrary: plan.inLibraryCount, gaps, next: 'publish' }
  }

  await setPlaylistGenerationStatus(database, generationId, 'ready')
  return { inLibrary: plan.inLibraryCount, gaps, next: 'done' }
}

function resolveSimilarTrackProvider(config: MusearrConfig, acquireMissing: boolean): SimilarTrackProvider {
  if (!acquireMissing) {
    return new NullSimilarTrackProvider()
  }

  const providers: SimilarTrackProvider[] = []

  // Deterministic source first.
  if (config.MUSEARR_MUSICBRAINZ_ENABLED && config.MUSEARR_MUSICBRAINZ_CONTACT) {
    providers.push(
      new MusicBrainzSimilarTrackProvider({
        contact: config.MUSEARR_MUSICBRAINZ_CONTACT,
        appName: 'Musearr',
        appVersion: MUSEARR_VERSION,
        ...(config.MUSEARR_MUSICBRAINZ_BASE_URL
          ? { musicBrainzBaseUrl: config.MUSEARR_MUSICBRAINZ_BASE_URL }
          : {}),
        ...(config.MUSEARR_LISTENBRAINZ_BASE_URL
          ? { listenBrainzBaseUrl: config.MUSEARR_LISTENBRAINZ_BASE_URL }
          : {}),
        ...(config.MUSEARR_MUSICBRAINZ_ALGORITHM
          ? { algorithm: config.MUSEARR_MUSICBRAINZ_ALGORITHM }
          : {}),
      }),
    )
  }

  const ai = createLocalAiProvider({
    enabled: config.MUSEARR_LOCAL_AI_ENABLED,
    provider: config.MUSEARR_LOCAL_AI_PROVIDER,
    baseUrl: config.MUSEARR_LOCAL_AI_BASE_URL,
    model: config.MUSEARR_LOCAL_AI_MODEL,
  })
  if (ai.enabled) {
    providers.push(new LocalAiSimilarTrackProvider(ai))
  }

  if (providers.length === 0) {
    return new NullSimilarTrackProvider()
  }
  return providers.length === 1 ? (providers[0] as SimilarTrackProvider) : new CompositeSimilarTrackProvider(providers)
}

export { PLAYLIST_ALGORITHM_VERSION }
