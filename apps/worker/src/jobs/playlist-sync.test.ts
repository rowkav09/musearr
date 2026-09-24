import { randomBytes } from 'node:crypto'
import { encryptSecret } from '@musearr/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  getLibrarySyncSources: vi.fn(),
  upsertUserPlaylists: vi.fn(async (_database: unknown, _source: unknown, playlists: unknown[]) => ({
    importedPlaylists: playlists.length,
    unresolvedItems: 0,
  })),
}))

vi.mock('@musearr/db', () => db)

const { syncPlexPlaylists } = await import('./playlist-sync.js')

const encryptionKey = randomBytes(32).toString('base64')
const database = {} as never

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const longPlaylist = Array.from({ length: 450 }, (_, index) => ({ ratingKey: 6000 + index, addedAt: 1_700_000_000 }))

function plexFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(String(input))
  if (url.pathname === '/playlists') {
    return Promise.resolve(
      json({
        MediaContainer: {
          Metadata: [
            { ratingKey: 91, title: 'Long Drive', playlistType: 'audio', updatedAt: 1_700_000_500 },
            { ratingKey: 92, title: 'Late Night', playlistType: 'audio' },
            { ratingKey: 93, title: 'Films', playlistType: 'video' },
          ],
        },
      }),
    )
  }
  const match = url.pathname.match(/^\/playlists\/(\d+)\/items$/)
  const start = Number(url.searchParams.get('X-Plex-Container-Start'))
  const size = Number(url.searchParams.get('X-Plex-Container-Size'))
  const all = match?.[1] === '91' ? longPlaylist : [{ ratingKey: 7001 }, {}, { ratingKey: 7002 }]
  return Promise.resolve(json({ MediaContainer: { totalSize: all.length, Metadata: all.slice(start, start + size) } }))
}

beforeEach(() => {
  vi.clearAllMocks()
  db.getLibrarySyncSources.mockResolvedValue([
    {
      plexServerId: 'server-1',
      machineIdentifier: 'machine-1',
      librarySectionId: 'section-row-1',
      plexSectionId: '4',
      serverName: 'Test Plex',
      baseUrl: 'http://plex.local:32400',
      tokenCiphertext: encryptSecret('test-token', encryptionKey),
      ownerUserId: 'user-1',
      ownerTimezone: 'Europe/London',
    },
  ])
})

afterEach(() => vi.unstubAllGlobals())

describe('syncPlexPlaylists', () => {
  it('reads every audio playlist in full across pages and skips non-audio ones', async () => {
    const fetchMock = vi.fn(plexFetch)
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncPlexPlaylists(database, encryptionKey, 'server-1')

    expect(result).toEqual({ importedPlaylists: 2, unresolvedItems: 0 })
    const playlists = (db.upsertUserPlaylists.mock.calls[0] as unknown as [unknown, unknown, Array<{ plexRatingKey: string; title: string; items: Array<{ plexTrackRatingKey: string }> }>])[2]
    expect(playlists.map((playlist) => playlist.plexRatingKey)).toEqual(['91', '92'])
    expect(playlists[0]?.items).toHaveLength(450)
    expect(new Set(playlists[0]?.items.map((item) => item.plexTrackRatingKey)).size).toBe(450)
    expect(playlists[1]?.items.map((item) => item.plexTrackRatingKey)).toEqual(['7001', '7002'])
    // 1 playlist list + 3 pages for the long playlist + 1 page for the short one.
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('refuses to run without an encryption key or a matching server', async () => {
    await expect(syncPlexPlaylists(database, undefined, 'server-1')).rejects.toThrow(/MUSEARR_ENCRYPTION_KEY/)
    await expect(syncPlexPlaylists(database, encryptionKey, 'other-server')).rejects.toThrow(/no longer has a selected/)
    expect(db.upsertUserPlaylists).not.toHaveBeenCalled()
  })
})
