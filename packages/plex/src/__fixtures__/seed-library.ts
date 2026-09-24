/**
 * Test-only fake Plex music section used to check import correctness.
 *
 * `seedLibraryMetadata` is what Plex returns for `/library/sections/<id>/all?type=10`.
 * `seedLibraryManifest` is what Musearr should import from it. Keep the two in step:
 * any change to the metadata must be reflected in the manifest by hand.
 */

export const SEED_SECTION_ID = '4'

type SeedMetadata = {
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
  grandparentRatingKey?: string | number
  grandparentTitle?: string
  Genre?: Array<{ tag?: string }>
}

export const seedLibraryMetadata: SeedMetadata[] = [
  // Multi-disc album: same album key, two discs.
  { ratingKey: 1001, title: 'Angel', index: 1, parentIndex: 1, duration: 379000, addedAt: 1_700_000_000, viewCount: 4, parentRatingKey: 201, parentTitle: 'Mezzanine (Deluxe)', parentYear: 1998, grandparentRatingKey: 301, grandparentTitle: 'Massive Attack', Genre: [{ tag: 'Trip Hop' }] },
  { ratingKey: 1002, title: 'Teardrop', index: 3, parentIndex: 1, duration: 331000, addedAt: 1_700_000_000, parentRatingKey: 201, parentTitle: 'Mezzanine (Deluxe)', parentYear: 1998, grandparentRatingKey: 301, grandparentTitle: 'Massive Attack', Genre: [{ tag: 'Trip Hop' }, { tag: ' ' }] },
  { ratingKey: 1003, title: 'Angel (Mad Professor Remix)', index: 1, parentIndex: 2, duration: 402000, addedAt: 1_700_000_000, parentRatingKey: 201, parentTitle: 'Mezzanine (Deluxe)', parentYear: 1998, grandparentRatingKey: 301, grandparentTitle: 'Massive Attack' },
  // Non-ASCII artist, album and track titles; string rating keys.
  { ratingKey: '1004', title: 'Hoppípolla', index: 2, parentIndex: 1, duration: 268000, addedAt: 1_700_100_000, viewCount: 11, userRating: 10, parentRatingKey: '202', parentTitle: 'Með suð í eyrum við spilum endalaust', parentYear: 2008, grandparentRatingKey: '302', grandparentTitle: 'Sigur Rós', Genre: [{ tag: 'Post-Rock' }] },
  { ratingKey: 1005, title: 'Jóga', index: 2, parentIndex: 1, duration: 305000, addedAt: 1_700_200_000, parentRatingKey: 203, parentTitle: 'Homogenic', parentYear: 1997, grandparentRatingKey: 303, grandparentTitle: 'Björk' },
  // Two different artists that share a name: identity is the rating key, not the name.
  { ratingKey: 1006, title: 'Sunflower', index: 1, parentIndex: 1, duration: 280000, addedAt: 1_700_300_000, parentRatingKey: 204, parentTitle: 'Things We Lost in the Fire', parentYear: 2001, grandparentRatingKey: 304, grandparentTitle: 'Low' },
  { ratingKey: 1007, title: 'Nightlife', index: 1, parentIndex: 1, duration: 212000, addedAt: 1_700_300_500, parentRatingKey: 205, parentTitle: 'Low', parentYear: 2019, grandparentRatingKey: 305, grandparentTitle: 'Low' },
  // Skipped by the client: no album.
  { ratingKey: 1008, title: 'Loose Single', index: 1, duration: 190000, grandparentRatingKey: 306, grandparentTitle: 'Unknown Artist' },
  // Skipped by the client: no title.
  { ratingKey: 1009, index: 4, parentIndex: 1, parentRatingKey: 203, parentTitle: 'Homogenic', grandparentRatingKey: 303, grandparentTitle: 'Björk' },
  // Missing optional fields only: still imported.
  { ratingKey: 1010, title: 'Untitled Track', parentRatingKey: 206, parentTitle: 'Demos', grandparentRatingKey: 307, grandparentTitle: 'Slowdive' },
  { ratingKey: 1011, title: 'Alison', index: 1, parentIndex: 1, duration: 230000, addedAt: 1_700_400_000, viewCount: 2, parentRatingKey: 207, parentTitle: 'Souvlaki', parentYear: 1993, grandparentRatingKey: 307, grandparentTitle: 'Slowdive', Genre: [{ tag: 'Shoegaze' }] },
  { ratingKey: 1012, title: 'When the Sun Hits', index: 4, parentIndex: 1, duration: 286000, addedAt: 1_700_400_000, parentRatingKey: 207, parentTitle: 'Souvlaki', parentYear: 1993, grandparentRatingKey: 307, grandparentTitle: 'Slowdive', Genre: [{ tag: 'Shoegaze' }] },
]

/** What a correct import of `seedLibraryMetadata` produces. */
export const seedLibraryManifest = {
  total: 12,
  skipped: 2,
  skippedRatingKeys: ['1008', '1009'],
  trackRatingKeys: ['1001', '1002', '1003', '1004', '1005', '1006', '1007', '1010', '1011', '1012'],
  artists: {
    '301': 'Massive Attack',
    '302': 'Sigur Rós',
    '303': 'Björk',
    '304': 'Low',
    '305': 'Low',
    '307': 'Slowdive',
  },
  albums: {
    '201': 'Mezzanine (Deluxe)',
    '202': 'Með suð í eyrum við spilum endalaust',
    '203': 'Homogenic',
    '204': 'Things We Lost in the Fire',
    '205': 'Low',
    '206': 'Demos',
    '207': 'Souvlaki',
  },
} as const

/**
 * A `fetch` stand-in that serves `seedLibraryMetadata` with Plex's paging query
 * parameters, so tests can drive the real `PlexClient` over several pages.
 */
export function createSeedPlexFetch(metadata: SeedMetadata[] = seedLibraryMetadata) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (!url.pathname.endsWith(`/library/sections/${SEED_SECTION_ID}/all`)) {
      return new Response('not found', { status: 404 })
    }
    const start = Number(url.searchParams.get('X-Plex-Container-Start') ?? 0)
    const size = Number(url.searchParams.get('X-Plex-Container-Size') ?? metadata.length)
    const page = metadata.slice(start, start + size)
    return new Response(
      JSON.stringify({ MediaContainer: { size: page.length, totalSize: metadata.length, Metadata: page } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
}
