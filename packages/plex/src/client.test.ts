import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlexClient, PlexConnectionError, normalisePlexBaseUrl } from './client.js'

afterEach(() => vi.unstubAllGlobals())

describe('normalisePlexBaseUrl', () => {
  it('removes a trailing slash but preserves a valid Plex origin', () => {
    expect(normalisePlexBaseUrl('http://plex.local:32400/')).toBe('http://plex.local:32400')
  })

  it('rejects embedded credentials and unsupported protocols', () => {
    expect(() => normalisePlexBaseUrl('https://user:pass@plex.local')).toThrow(PlexConnectionError)
    expect(() => normalisePlexBaseUrl('ftp://plex.local')).toThrow(PlexConnectionError)
  })

  it('maps Plex track pages while retaining source identifiers and optional playback fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            MediaContainer: {
              totalSize: 1,
              Metadata: [
                {
                  ratingKey: 17,
                  title: 'Teardrop',
                  index: 1,
                  parentIndex: 1,
                  duration: 331000,
                  addedAt: 1_700_000_000,
                  updatedAt: 1_700_000_100,
                  viewCount: 9,
                  lastViewedAt: 1_700_100_000,
                  userRating: 9,
                  parentRatingKey: 12,
                  parentTitle: 'Mezzanine',
                  parentYear: 1998,
                  grandparentRatingKey: 7,
                  grandparentTitle: 'Massive Attack',
                  Genre: [{ tag: 'Trip Hop' }],
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    const page = await new PlexClient('http://plex.local:32400', 'test-token').libraryTracks('4', 0, 200)

    expect(page).toMatchObject({ total: 1, offset: 0, scanned: 1, skipped: 0 })
    expect(page.items).toEqual([
      expect.objectContaining({
        plexRatingKey: '17',
        title: 'Teardrop',
        playCount: 9,
        artist: expect.objectContaining({ plexRatingKey: '7', name: 'Massive Attack' }),
        album: expect.objectContaining({ plexRatingKey: '12', title: 'Mezzanine', year: 1998 }),
        genres: ['Trip Hop'],
      }),
    ])
  })
})
