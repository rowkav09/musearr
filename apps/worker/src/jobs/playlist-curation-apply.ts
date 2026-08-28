import type { MusearrConfig } from '@musearr/config'
import { decryptSecret } from '@musearr/core'
import {
  getAcceptedCurationItems,
  getCurationJobContext,
  getLibrarySyncSources,
  markCurationItemsApplied,
  setCurationStatus,
  type CurationStatus,
  type Database,
} from '@musearr/db'
import { PlexClient } from '@musearr/plex'

export type CurationApplyOutcome = {
  added: number
  status: CurationStatus
}

/**
 * Adds the accepted tracks of a curation to its target Plex playlist. Additive
 * only — it never removes or reorders. `addPlaylistItems` is idempotent, so a
 * retry after a partial failure is safe.
 */
export async function applyCuration(
  database: Database,
  config: MusearrConfig,
  curationId: string,
): Promise<CurationApplyOutcome> {
  const context = await getCurationJobContext(database, curationId)
  if (!context) {
    throw new Error('The curation no longer exists.')
  }
  if (!config.MUSEARR_ENCRYPTION_KEY) {
    throw new Error('MUSEARR_ENCRYPTION_KEY is required before a Plex playlist can be written.')
  }

  const accepted = await getAcceptedCurationItems(database, curationId)
  if (accepted.length === 0) {
    await setCurationStatus(database, curationId, 'applied')
    return { added: 0, status: 'applied' }
  }

  const [source] = await getLibrarySyncSources(database)
  if (!source) {
    await setCurationStatus(database, curationId, 'failed', 'No Plex library is connected.')
    return { added: 0, status: 'failed' }
  }

  await setCurationStatus(database, curationId, 'applying')

  const client = new PlexClient(
    source.baseUrl,
    decryptSecret(source.tokenCiphertext, config.MUSEARR_ENCRYPTION_KEY),
  )

  try {
    await client.addPlaylistItems(
      context.plexPlaylistRatingKey,
      source.machineIdentifier,
      accepted.map((item) => item.plexRatingKey),
    )
  } catch (error) {
    await setCurationStatus(
      database,
      curationId,
      'failed',
      error instanceof Error ? error.message : 'Plex rejected the playlist update.',
    )
    return { added: 0, status: 'failed' }
  }

  await markCurationItemsApplied(
    database,
    accepted.map((item) => item.id),
  )
  await setCurationStatus(database, curationId, 'applied')
  return { added: accepted.length, status: 'applied' }
}
