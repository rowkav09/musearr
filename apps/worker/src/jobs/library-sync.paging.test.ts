import { randomBytes } from 'node:crypto'
import { encryptSecret } from '@musearr/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEED_SECTION_ID,
  createSeedPlexFetch,
  seedLibraryManifest,
} from '../../../../packages/plex/src/__fixtures__/seed-library.js'

const db = vi.hoisted(() => ({
  beginSyncRun: vi.fn(async () => 'run-1'),
  completeSyncRun: vi.fn(async () => undefined),
  failSyncRun: vi.fn(async () => undefined),
  getLibrarySyncSources: vi.fn(),
  rebuildListeningRollups: vi.fn(async () => undefined),
  // The job reuses one progress object, so snapshot the offset at call time like the real UPDATE does.
  savedOffsets: [] as number[],
  updateSyncProgress: vi.fn(async (_database: unknown, _runId: string, progress: { offset: number }) => {
    db.savedOffsets.push(progress.offset)
  }),
  upsertLibraryTracks: vi.fn(async () => undefined),
}))

vi.mock('@musearr/db', () => db)

const { syncPlexLibrary } = await import('./library-sync.js')

const encryptionKey = randomBytes(32).toString('base64')
const database = {} as never

function generatedTracks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ratingKey: 5000 + index,
    title: `Track ${index}`,
    parentRatingKey: 700 + Math.floor(index / 10),
    parentTitle: `Album ${Math.floor(index / 10)}`,
    grandparentRatingKey: 800,
    grandparentTitle: 'Generated Artist',
  }))
}

function plexPage(metadata: unknown[], totalSize: number) {
  return new Response(JSON.stringify({ MediaContainer: { size: metadata.length, totalSize, Metadata: metadata } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function upsertedKeys(): string[] {
  return db.upsertLibraryTracks.mock.calls.flatMap(
    (call) => (call as unknown as [unknown, unknown, Array<{ plexRatingKey: string }>])[2].map((track) => track.plexRatingKey),
  )
}


beforeEach(() => {
  vi.clearAllMocks()
  db.savedOffsets.length = 0
  db.getLibrarySyncSources.mockResolvedValue([
    {
      plexServerId: 'server-1',
      machineIdentifier: 'machine-1',
      librarySectionId: 'section-row-1',
      plexSectionId: SEED_SECTION_ID,
      serverName: 'Test Plex',
      baseUrl: 'http://plex.local:32400',
      tokenCiphertext: encryptSecret('test-token', encryptionKey),
      ownerUserId: 'user-1',
      ownerTimezone: 'Europe/London',
    },
  ])
})

afterEach(() => vi.unstubAllGlobals())

describe('syncPlexLibrary paging', () => {
  it('imports the seed library exactly as the manifest says', async () => {
    vi.stubGlobal('fetch', vi.fn(createSeedPlexFetch()))

    const result = await syncPlexLibrary(database, encryptionKey, 'section-row-1', 'manual')

    expect(result).toEqual({
      importedTracks: seedLibraryManifest.trackRatingKeys.length,
      skippedTracks: seedLibraryManifest.skipped,
    })
    expect(upsertedKeys()).toEqual(seedLibraryManifest.trackRatingKeys)
    expect(db.completeSyncRun).toHaveBeenCalledOnce()
    expect(db.failSyncRun).not.toHaveBeenCalled()
  })

  it('walks every page once and saves increasing offsets', async () => {
    const metadata = generatedTracks(450)
    const fetchMock = vi.fn(createSeedPlexFetch(metadata as never))
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncPlexLibrary(database, encryptionKey, 'section-row-1', 'manual')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(db.savedOffsets).toEqual([200, 400, 450])
    const keys = upsertedKeys()
    expect(keys).toHaveLength(450)
    expect(new Set(keys).size).toBe(450)
    expect(result).toEqual({ importedTracks: 450, skippedTracks: 0 })
  })

  it('finishes cleanly on an empty section', async () => {
    const fetchMock = vi.fn(async () => plexPage([], 0))
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncPlexLibrary(database, encryptionKey, 'section-row-1', 'manual')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result).toEqual({ importedTracks: 0, skippedTracks: 0 })
    expect(db.completeSyncRun).toHaveBeenCalledOnce()
  })

  it('stops when Plex returns an empty page before the reported total', async () => {
    const metadata = generatedTracks(300)
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      const start = Number(url.searchParams.get('X-Plex-Container-Start'))
      const size = Number(url.searchParams.get('X-Plex-Container-Size'))
      return plexPage(metadata.slice(start, start + size), 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncPlexLibrary(database, encryptionKey, 'section-row-1', 'manual')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ importedTracks: 300, skippedTracks: 0 })
    expect(db.completeSyncRun).toHaveBeenCalledOnce()
  })

  it('stops when the library shrinks mid-sync', async () => {
    const metadata = generatedTracks(450)
    let calls = 0
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      calls += 1
      const url = new URL(String(input))
      const start = Number(url.searchParams.get('X-Plex-Container-Start'))
      const size = Number(url.searchParams.get('X-Plex-Container-Size'))
      const current = calls === 1 ? metadata : metadata.slice(0, 250)
      return plexPage(current.slice(start, start + size), current.length)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncPlexLibrary(database, encryptionKey, 'section-row-1', 'manual')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ importedTracks: 250, skippedTracks: 0 })
  })

  it('records a sanitised failure and does not complete the run when Plex errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))

    await expect(syncPlexLibrary(database, encryptionKey, 'section-row-1', 'manual')).rejects.toThrow()

    expect(db.failSyncRun).toHaveBeenCalledOnce()
    const failure = (db.failSyncRun.mock.calls[0] as unknown as [unknown, string, { retryable: boolean }])[2]
    expect(failure).toMatchObject({ retryable: true })
    expect(db.completeSyncRun).not.toHaveBeenCalled()
  })
})
