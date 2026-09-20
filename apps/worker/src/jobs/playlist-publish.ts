import type { MusearrConfig } from '@musearr/config'
import { decryptSecret } from '@musearr/core'
import {
  getGenerationItemStateCounts,
  getLibrarySyncSources,
  getPlaylistGenerationJobContext,
  getPublishableGenerationItems,
  linkManagedPlexPlaylist,
  markGenerationItemsPublished,
  recordPlaylistPublication,
  setPlaylistGenerationStatus,
  type Database,
  type PlaylistGenerationStatus,
} from '@musearr/db'
import { PlexClient } from '@musearr/plex'

export type PlaylistPublishOutcome = {
  created: boolean
  added: number
  status: PlaylistGenerationStatus
}

/**
 * Publishes a generation to Plex as a Musearr-managed playlist. Additive and
 * idempotent: only items that carry a Plex rating key and have not been
 * published yet are sent, so a retry after a partial failure resumes cleanly
 * and never touches a user's own playlist.
 */
export async function publishPlaylistToPlex(
  database: Database,
  config: MusearrConfig,
  generationId: string,
): Promise<PlaylistPublishOutcome> {
  const context = await getPlaylistGenerationJobContext(database, generationId)
  if (!context) {
    throw new Error('The playlist generation no longer exists.')
  }
  if (!context.publishToPlex) {
    return { created: false, added: 0, status: context.status }
  }
  if (!config.MUSEARR_ENCRYPTION_KEY) {
    throw new Error('MUSEARR_ENCRYPTION_KEY is required before a Plex playlist can be written.')
  }

  const [source] = await getLibrarySyncSources(database)
  if (!source) {
    throw new Error('No Plex music library is connected, so the playlist cannot be published.')
  }

  await setPlaylistGenerationStatus(database, generationId, 'publishing')

  const client = new PlexClient(
    source.baseUrl,
    decryptSecret(source.tokenCiphertext, config.MUSEARR_ENCRYPTION_KEY),
  )
  const items = await getPublishableGenerationItems(database, generationId)
  const ratingKeys = items.map((item) => item.plexRatingKey)

  let plexPlaylistRatingKey = context.plexPlaylistRatingKey
  let created = false

  try {
    if (!plexPlaylistRatingKey) {
      const existing = await client.findAudioPlaylistByTitle(context.name)
      if (existing) {
        plexPlaylistRatingKey = existing.plexRatingKey
        if (ratingKeys.length > 0) {
          await client.addPlaylistItems(plexPlaylistRatingKey, source.machineIdentifier, ratingKeys)
        }
      } else {
        if (ratingKeys.length === 0) {
          await setPlaylistGenerationStatus(database, generationId, 'ready')
          return { created: false, added: 0, status: 'ready' }
        }
        const result = await client.createAudioPlaylist(source.machineIdentifier, context.name, ratingKeys)
        plexPlaylistRatingKey = result.plexRatingKey
        created = true
      }
      await linkManagedPlexPlaylist(database, {
        generationId,
        plexServerId: source.plexServerId,
        plexRatingKey: plexPlaylistRatingKey,
        name: context.name,
      })
    } else if (ratingKeys.length > 0) {
      await client.addPlaylistItems(plexPlaylistRatingKey, source.machineIdentifier, ratingKeys)
    }
  } catch (error) {
    await recordPlaylistPublication(database, {
      generationId,
      plexServerId: source.plexServerId,
      plexPlaylistRatingKey,
      requestedItemCount: ratingKeys.length,
      publishedItemCount: 0,
      status: 'failed',
      errorSummary: error instanceof Error ? error.message : 'unknown',
    })
    throw error
  }

  await markGenerationItemsPublished(
    database,
    items.map((item) => item.id),
  )

  const counts = await getGenerationItemStateCounts(database, generationId)
  const inFlight = counts.pending + counts.requested + counts.downloading + counts.imported
  const status: PlaylistGenerationStatus =
    inFlight > 0 ? 'awaiting_acquisition' : counts.unavailable > 0 ? 'partially_published' : 'published'
  await setPlaylistGenerationStatus(database, generationId, status)

  await recordPlaylistPublication(database, {
    generationId,
    plexServerId: source.plexServerId,
    plexPlaylistRatingKey,
    requestedItemCount: ratingKeys.length,
    publishedItemCount: ratingKeys.length,
    status: 'completed',
  })

  return { created, added: ratingKeys.length, status }
}
