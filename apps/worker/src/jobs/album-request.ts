import type { MusearrConfig } from '@musearr/config'
import { decryptSecret } from '@musearr/core'
import { getLidarrConnection, type Database } from '@musearr/db'
import { LidarrClient } from '@musearr/lidarr'

export type AlbumRequestOutcome = {
  requested: boolean
  detail: string
}

/**
 * Asks Lidarr to fetch an album: make sure the artist is added, monitor the
 * album, and trigger a search. Best-effort — a missing artist or album is
 * reported, not thrown, so a retry doesn't loop.
 */
export async function requestAlbumForLibrary(
  database: Database,
  config: MusearrConfig,
  input: { artistName: string; albumTitle: string },
): Promise<AlbumRequestOutcome> {
  const connection = await getLidarrConnection(database)
  if (!connection) {
    return { requested: false, detail: 'Lidarr is not connected.' }
  }
  if (!config.MUSEARR_ENCRYPTION_KEY) {
    throw new Error('MUSEARR_ENCRYPTION_KEY is required before Lidarr requests can run.')
  }

  const client = new LidarrClient(
    connection.baseUrl,
    decryptSecret(connection.apiKeyCiphertext, config.MUSEARR_ENCRYPTION_KEY),
  )

  const rootFolderPath = connection.rootFolderPath ?? (await client.rootFolders())[0]?.path ?? null
  const qualityProfileId =
    connection.qualityProfileId ?? (await client.qualityProfiles())[0]?.id ?? null
  const metadataProfileId =
    connection.metadataProfileId ?? (await client.metadataProfiles())[0]?.id ?? null
  if (rootFolderPath === null || qualityProfileId === null || metadataProfileId === null) {
    return { requested: false, detail: 'Lidarr has no root folder or quality/metadata profile set.' }
  }

  const wanted = input.artistName.trim().toLowerCase()
  const existing = (await client.getArtists()).find(
    (artist) => artist.artistName.trim().toLowerCase() === wanted,
  )
  let artistId = existing?.id ?? null
  if (artistId === null) {
    const [match] = await client.lookupArtist(input.artistName)
    if (!match) {
      return { requested: false, detail: `Lidarr could not find the artist “${input.artistName}”.` }
    }
    const added = await client.addArtist({
      foreignArtistId: match.foreignArtistId,
      artistName: match.artistName,
      rootFolderPath,
      qualityProfileId,
      metadataProfileId,
      monitored: true,
    })
    artistId = added.id
  }

  const target = input.albumTitle.trim().toLowerCase()
  const album = (await client.getAlbums(artistId)).find(
    (entry) => entry.title.trim().toLowerCase() === target,
  )
  if (!album) {
    return {
      requested: false,
      detail: `Added/updated the artist, but Lidarr has no album “${input.albumTitle}”.`,
    }
  }

  await client.setAlbumsMonitored([album.id], true)
  await client.searchAlbums([album.id])
  return { requested: true, detail: `Requested “${input.albumTitle}” by ${input.artistName} in Lidarr.` }
}
