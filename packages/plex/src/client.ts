import type { PlexConnectionResult, PlexLibrarySection } from '@musearr/contracts'

const PLEX_HEADERS = {
  Accept: 'application/json',
  'X-Plex-Product': 'Musearr',
  'X-Plex-Version': '0.1.0',
  'X-Plex-Client-Identifier': 'musearr-server',
} as const

type PlexIdentityResponse = {
  MediaContainer?: {
    machineIdentifier?: string
    friendlyName?: string
    version?: string
  }
}

type PlexSectionsResponse = {
  MediaContainer?: {
    Directory?: Array<{
      key?: string | number
      title?: string
      type?: string
    }>
  }
}

type PlexTrackResponse = {
  MediaContainer?: {
    size?: number
    totalSize?: number
    Metadata?: Array<{
      ratingKey?: string | number
      title?: string
      index?: number
      parentIndex?: number
      duration?: number
      addedAt?: number
      updatedAt?: number
      viewCount?: number
      lastViewedAt?: number
      userRating?: number
      parentRatingKey?: string | number
      parentTitle?: string
      parentYear?: number
      parentThumb?: string
      grandparentRatingKey?: string | number
      grandparentTitle?: string
      grandparentThumb?: string
      Genre?: Array<{ tag?: string }>
    }>
  }
}

type PlexPlaylistResponse = {
  MediaContainer?: {
    Metadata?: Array<{
      ratingKey?: string | number
      title?: string
      playlistType?: string
      updatedAt?: number
    }>
  }
}

type PlexPlaylistItemsResponse = {
  MediaContainer?: {
    size?: number
    totalSize?: number
    Metadata?: Array<{
      ratingKey?: string | number
      addedAt?: number
    }>
  }
}

export type PlexLibraryTrack = {
  plexRatingKey: string
  title: string
  trackNumber: number | null
  discNumber: number | null
  durationMs: number | null
  addedAt: string | null
  plexUpdatedAt: string | null
  playCount: number
  lastPlayedAt: string | null
  rating: number | null
  artist: {
    plexRatingKey: string
    name: string
    thumbKey: string | null
  }
  album: {
    plexRatingKey: string
    title: string
    year: number | null
    thumbKey: string | null
  }
  genres: string[]
}

export type PlexTrackPage = {
  total: number
  offset: number
  scanned: number
  items: PlexLibraryTrack[]
  skipped: number
}

export type PlexPlaylist = {
  plexRatingKey: string
  title: string
  revision: string | null
}

export type PlexPlaylistItem = {
  plexTrackRatingKey: string
  addedAt: string | null
}

export type PlexPlaylistItemPage = {
  total: number
  offset: number
  scanned: number
  items: PlexPlaylistItem[]
  skipped: number
}

export class PlexConnectionError extends Error {
  public readonly code: 'UNREACHABLE' | 'UNAUTHENTICATED' | 'INVALID_RESPONSE'

  constructor(code: PlexConnectionError['code'], message: string) {
    super(message)
    this.name = 'PlexConnectionError'
    this.code = code
  }
}

export function normalisePlexBaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim())
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new PlexConnectionError('INVALID_RESPONSE', 'Use an HTTP or HTTPS Plex server address.')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new PlexConnectionError('INVALID_RESPONSE', 'Use only the Plex server origin, without credentials or query parameters.')
  }

  parsed.pathname = parsed.pathname.replace(/\/$/, '')
  return parsed.toString().replace(/\/$/, '')
}

export class PlexClient {
  private readonly baseUrl: string
  private readonly token: string

  constructor(baseUrl: string, token: string) {
    this.baseUrl = normalisePlexBaseUrl(baseUrl)
    this.token = token
  }

  async testConnection(): Promise<PlexConnectionResult> {
    const [identity, sections] = await Promise.all([this.identity(), this.librarySections()])
    const machineIdentifier = identity.MediaContainer?.machineIdentifier

    if (!machineIdentifier) {
      throw new PlexConnectionError('INVALID_RESPONSE', 'Plex did not return a server identity.')
    }

    return {
      machineIdentifier,
      serverName: identity.MediaContainer?.friendlyName ?? 'Plex Media Server',
      version: identity.MediaContainer?.version ?? null,
      musicLibraries: sections,
    }
  }

  async libraryTracks(sectionId: string, offset: number, size: number): Promise<PlexTrackPage> {
    const start = Math.max(0, Math.floor(offset))
    const pageSize = Math.min(500, Math.max(1, Math.floor(size)))
    const payload = await this.request<PlexTrackResponse>(
      `/library/sections/${encodeURIComponent(sectionId)}/all?type=10&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`,
    )
    const metadata = payload.MediaContainer?.Metadata ?? []
    const tracks = metadata.flatMap((item) => normaliseTrack(item))

    return {
      total: payload.MediaContainer?.totalSize ?? tracks.length,
      offset: start,
      scanned: metadata.length,
      items: tracks,
      skipped: metadata.length - tracks.length,
    }
  }

  async audioPlaylists(): Promise<PlexPlaylist[]> {
    const payload = await this.request<PlexPlaylistResponse>('/playlists?playlistType=audio')
    return (payload.MediaContainer?.Metadata ?? [])
      .filter((playlist) => playlist.ratingKey !== undefined && playlist.title && playlist.playlistType === 'audio')
      .map((playlist) => ({
        plexRatingKey: String(playlist.ratingKey),
        title: playlist.title as string,
        revision: timestampOrNull(playlist.updatedAt),
      }))
  }

  async playlistItems(playlistId: string, offset: number, size: number): Promise<PlexPlaylistItemPage> {
    const start = Math.max(0, Math.floor(offset))
    const pageSize = Math.min(500, Math.max(1, Math.floor(size)))
    const payload = await this.request<PlexPlaylistItemsResponse>(
      `/playlists/${encodeURIComponent(playlistId)}/items?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`,
    )
    const metadata = payload.MediaContainer?.Metadata ?? []
    const items = metadata.flatMap((item) => {
      if (item.ratingKey === undefined) {
        return []
      }
      return [
        {
          plexTrackRatingKey: String(item.ratingKey),
          addedAt: timestampOrNull(item.addedAt),
        },
      ]
    })

    return {
      total: payload.MediaContainer?.totalSize ?? items.length,
      offset: start,
      scanned: metadata.length,
      items,
      skipped: metadata.length - items.length,
    }
  }

  private async identity(): Promise<PlexIdentityResponse> {
    return this.request<PlexIdentityResponse>('/identity')
  }

  private async librarySections(): Promise<PlexLibrarySection[]> {
    const payload = await this.request<PlexSectionsResponse>('/library/sections')
    return (payload.MediaContainer?.Directory ?? [])
      .filter((section) => section.type === 'artist' && section.key !== undefined && section.title)
      .map((section) => ({
        id: String(section.key),
        title: section.title as string,
        type: 'artist',
      }))
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          ...PLEX_HEADERS,
          'X-Plex-Token': this.token,
        },
        signal: controller.signal,
      })

      if (response.status === 401 || response.status === 403) {
        throw new PlexConnectionError('UNAUTHENTICATED', 'Plex rejected the supplied token.')
      }
      if (!response.ok) {
        throw new PlexConnectionError('UNREACHABLE', 'Musearr could not reach the Plex server.')
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof PlexConnectionError) {
        throw error
      }
      throw new PlexConnectionError('UNREACHABLE', 'Musearr could not reach the Plex server.')
    } finally {
      clearTimeout(timeout)
    }
  }
}

function normaliseTrack(
  item: NonNullable<NonNullable<PlexTrackResponse['MediaContainer']>['Metadata']>[number],
): PlexLibraryTrack[] {
  if (
    item.ratingKey === undefined ||
    !item.title ||
    item.parentRatingKey === undefined ||
    !item.parentTitle ||
    item.grandparentRatingKey === undefined ||
    !item.grandparentTitle
  ) {
    return []
  }

  return [
    {
      plexRatingKey: String(item.ratingKey),
      title: item.title,
      trackNumber: integerOrNull(item.index),
      discNumber: integerOrNull(item.parentIndex),
      durationMs: integerOrNull(item.duration),
      addedAt: timestampOrNull(item.addedAt),
      plexUpdatedAt: timestampOrNull(item.updatedAt),
      playCount: integerOrNull(item.viewCount) ?? 0,
      lastPlayedAt: timestampOrNull(item.lastViewedAt),
      rating: integerOrNull(item.userRating),
      artist: {
        plexRatingKey: String(item.grandparentRatingKey),
        name: item.grandparentTitle,
        thumbKey: item.grandparentThumb ?? null,
      },
      album: {
        plexRatingKey: String(item.parentRatingKey),
        title: item.parentTitle,
        year: integerOrNull(item.parentYear),
        thumbKey: item.parentThumb ?? null,
      },
      genres: (item.Genre ?? [])
        .map((genre) => genre.tag?.trim())
        .filter((genre): genre is string => Boolean(genre)),
    },
  ]
}

function integerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function timestampOrNull(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1_000).toISOString()
    : null
}
