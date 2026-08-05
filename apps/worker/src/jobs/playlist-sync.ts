import { decryptSecret } from '@musearr/core'
import {
  getLibrarySyncSources,
  upsertUserPlaylists,
  type Database,
} from '@musearr/db'
import { PlexClient, type PlexPlaylistItem } from '@musearr/plex'

const PAGE_SIZE = 200

export async function syncPlexPlaylists(
  database: Database,
  encryptionKey: string | undefined,
  plexServerId: string,
): Promise<{ importedPlaylists: number; unresolvedItems: number }> {
  if (!encryptionKey) {
    throw new Error('MUSEARR_ENCRYPTION_KEY is required before Plex playlist sync can run.')
  }

  const source = (await getLibrarySyncSources(database)).find(
    (candidate) => candidate.plexServerId === plexServerId,
  )
  if (!source) {
    throw new Error('The requested Plex server no longer has a selected music library.')
  }

  const client = new PlexClient(source.baseUrl, decryptSecret(source.tokenCiphertext, encryptionKey))
  const playlists = await client.audioPlaylists()
  const playlistsWithItems: Array<{
    plexRatingKey: string
    title: string
    revision: string | null
    items: PlexPlaylistItem[]
  }> = []
  for (const playlist of playlists) {
    const items: PlexPlaylistItem[] = []
    let offset = 0
    while (true) {
      const page = await client.playlistItems(playlist.plexRatingKey, offset, PAGE_SIZE)
      items.push(...page.items)
      offset += page.scanned
      if (page.scanned === 0 || offset >= page.total) {
        break
      }
    }
    playlistsWithItems.push({ ...playlist, items })
  }

  return upsertUserPlaylists(database, source, playlistsWithItems)
}
