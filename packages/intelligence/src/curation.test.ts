import { describe, expect, it } from 'vitest'
import { CURATION_ALGORITHM_VERSION, proposeCurationAdditions, type CurationLibraryTrack } from './curation.js'

let seq = 0
function track(overrides: Partial<CurationLibraryTrack> = {}): CurationLibraryTrack {
  seq += 1
  return {
    trackId: `track-${seq}`,
    plexRatingKey: `rk-${seq}`,
    artistId: 'artist-x',
    artistName: 'Artist X',
    albumId: 'album-x',
    albumTitle: 'Album X',
    trackTitle: `Song ${seq}`,
    genres: ['shoegaze'],
    year: 1993,
    rating: null,
    playCount: 0,
    ...overrides,
  }
}

describe('proposeCurationAdditions', () => {
  it('never proposes a track already on the playlist', () => {
    const onList = track({ trackId: 'on-list', artistId: 'a1', genres: ['dream pop'] })
    const candidate = track({ trackId: 'candidate', artistId: 'a1', genres: ['dream pop'] })
    const proposal = proposeCurationAdditions([onList], [onList, candidate])
    expect(proposal.items.map((item) => item.trackId)).toEqual(['candidate'])
    expect(proposal.basisTrackCount).toBe(1)
    expect(proposal.algorithmVersion).toBe(CURATION_ALGORITHM_VERSION)
  })

  it('drops candidates with no shared artist and no shared genre', () => {
    const basis = [track({ artistId: 'a1', genres: ['ambient'] })]
    const unrelated = track({ trackId: 'unrelated', artistId: 'a9', genres: ['grindcore'] })
    const fitsGenre = track({ trackId: 'fits', artistId: 'a8', genres: ['ambient'] })
    const proposal = proposeCurationAdditions(basis, [...basis, unrelated, fitsGenre])
    const ids = proposal.items.map((item) => item.trackId)
    expect(ids).toContain('fits')
    expect(ids).not.toContain('unrelated')
  })

  it('caps a single artist at two entries', () => {
    const basis = [track({ artistId: 'a1', genres: ['post-rock'] })]
    const flood = Array.from({ length: 6 }, (_, index) =>
      track({ trackId: `flood-${index}`, artistId: 'a1', genres: ['post-rock'] }),
    )
    const proposal = proposeCurationAdditions(basis, [...basis, ...flood], { limit: 10 })
    expect(proposal.items).toHaveLength(2)
  })

  it('is deterministic and orders by score then id', () => {
    const basis = [
      track({ artistId: 'a1', genres: ['shoegaze'], year: 1991 }),
      track({ artistId: 'a2', genres: ['shoegaze', 'dream pop'], year: 1993 }),
    ]
    const library = [
      ...basis,
      track({ trackId: 'z-strong', artistId: 'a1', genres: ['shoegaze'], year: 1992, rating: 9 }),
      track({ trackId: 'a-weak', artistId: 'a7', genres: ['dream pop'], year: 2015 }),
    ]
    const first = proposeCurationAdditions(basis, library, { limit: 5 })
    const second = proposeCurationAdditions(basis, [...library].reverse(), { limit: 5 })
    expect(first.items.map((item) => item.trackId)).toEqual(second.items.map((item) => item.trackId))
    expect(first.items[0]?.trackId).toBe('z-strong')
    expect(first.items[0]?.score).toBeGreaterThan(first.items[first.items.length - 1]?.score ?? 1)
  })

  it('returns a deeper shortlist when shortlistFactor > 1', () => {
    const basis = [track({ artistId: 'a1', genres: ['indie'] })]
    const many = Array.from({ length: 30 }, (_, index) =>
      track({ trackId: `c-${index}`, artistId: `artist-${index}`, genres: ['indie'], rating: 7 }),
    )
    const shallow = proposeCurationAdditions(basis, [...basis, ...many], { limit: 5 })
    const deep = proposeCurationAdditions(basis, [...basis, ...many], { limit: 5, shortlistFactor: 2 })
    expect(shallow.items).toHaveLength(5)
    expect(deep.items.length).toBe(10)
  })
})
