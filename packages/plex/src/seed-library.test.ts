import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlexClient, type PlexLibraryTrack } from './client.js'
import { SEED_SECTION_ID, createSeedPlexFetch, seedLibraryManifest } from './__fixtures__/seed-library.js'

afterEach(() => vi.unstubAllGlobals())

async function readWholeSection(pageSize: number) {
  const client = new PlexClient('http://plex.local:32400', 'test-token')
  const tracks: PlexLibraryTrack[] = []
  let offset = 0
  let skipped = 0
  let pages = 0
  while (true) {
    const page = await client.libraryTracks(SEED_SECTION_ID, offset, pageSize)
    pages += 1
    tracks.push(...page.items)
    skipped += page.skipped
    offset += page.scanned
    if (page.scanned === 0 || offset >= page.total) {
      return { tracks, skipped, pages, total: page.total }
    }
  }
}

describe('seed Plex library fixture', () => {
  it('imports exactly the manifest across several pages', async () => {
    vi.stubGlobal('fetch', vi.fn(createSeedPlexFetch()))

    const result = await readWholeSection(5)

    expect(result.pages).toBe(3)
    expect(result.total).toBe(seedLibraryManifest.total)
    expect(result.skipped).toBe(seedLibraryManifest.skipped)
    expect(result.tracks.map((track) => track.plexRatingKey)).toEqual(seedLibraryManifest.trackRatingKeys)

    const artists = Object.fromEntries(result.tracks.map((track) => [track.artist.plexRatingKey, track.artist.name]))
    const albums = Object.fromEntries(result.tracks.map((track) => [track.album.plexRatingKey, track.album.title]))
    expect(artists).toEqual(seedLibraryManifest.artists)
    expect(albums).toEqual(seedLibraryManifest.albums)
  })

  it('gives the same result whatever the page size', async () => {
    vi.stubGlobal('fetch', vi.fn(createSeedPlexFetch()))

    const small = await readWholeSection(1)
    const large = await readWholeSection(200)

    expect(small.pages).toBe(seedLibraryManifest.total)
    expect(large.pages).toBe(1)
    expect(small.tracks).toEqual(large.tracks)
    expect(small.skipped).toBe(large.skipped)
  })

  it('keeps disc numbers and drops blank genres', async () => {
    vi.stubGlobal('fetch', vi.fn(createSeedPlexFetch()))

    const { tracks } = await readWholeSection(200)
    const byKey = new Map(tracks.map((track) => [track.plexRatingKey, track]))

    expect(byKey.get('1003')).toMatchObject({ discNumber: 2, trackNumber: 1 })
    expect(byKey.get('1002')?.genres).toEqual(['Trip Hop'])
    expect(byKey.get('1010')).toMatchObject({ trackNumber: null, discNumber: null, durationMs: null, playCount: 0 })
  })
})
