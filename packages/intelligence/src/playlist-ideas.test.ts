import { describe, expect, it } from 'vitest'
import {
  ideaMatchesTrack,
  proposePlaylistIdeas,
  type IdeaLibraryTrack,
} from './playlist-ideas.js'

let n = 0
function tk(o: Partial<IdeaLibraryTrack> = {}): IdeaLibraryTrack {
  n += 1
  return { trackId: `t${n}`, artistId: 'a1', artistName: 'A', genres: ['rock'], year: 1994, rating: null, playCount: 0, ...o }
}

describe('proposePlaylistIdeas', () => {
  it('proposes an under-covered genre group above the minimum size', () => {
    const jazz = Array.from({ length: 20 }, (_, i) => tk({ trackId: `j${i}`, genres: ['Jazz'], artistId: `ja${i % 4}`, year: 1965 }))
    const ideas = proposePlaylistIdeas(jazz, new Set(), { minGroupSize: 10 })
    const genreIdea = ideas.find((idea) => idea.kind === 'genre')
    expect(genreIdea?.filter).toEqual({ kind: 'genre', genre: 'jazz' })
    expect(genreIdea?.libraryTrackCount).toBe(20)
    expect(genreIdea?.coveredTrackCount).toBe(0)
  })

  it('skips a group that is already well covered', () => {
    const rock = Array.from({ length: 20 }, (_, i) => tk({ trackId: `r${i}`, genres: ['Rock'] }))
    const allCovered = new Set(rock.map((t) => t.trackId))
    const ideas = proposePlaylistIdeas(rock, allCovered, { minGroupSize: 10 })
    expect(ideas.find((idea) => idea.kind === 'genre')).toBeUndefined()
  })

  it('is deterministic regardless of input order', () => {
    const lib = [
      ...Array.from({ length: 15 }, (_, i) => tk({ trackId: `g${i}`, genres: ['Ambient'], artistId: `x${i % 3}` })),
      ...Array.from({ length: 15 }, (_, i) => tk({ trackId: `h${i}`, genres: ['Techno'], year: 2001, artistId: `y${i % 3}` })),
    ]
    const a = proposePlaylistIdeas(lib, new Set(), { minGroupSize: 10 })
    const b = proposePlaylistIdeas([...lib].reverse(), new Set(), { minGroupSize: 10 })
    expect(a.map((i) => i.name)).toEqual(b.map((i) => i.name))
  })

  it('proposes a favourites idea when enough tracks are rated 8+', () => {
    const lib = Array.from({ length: 14 }, (_, i) => tk({ trackId: `f${i}`, rating: 9, genres: ['Various'], artistId: `z${i}` }))
    const ideas = proposePlaylistIdeas(lib, new Set(), { minGroupSize: 12 })
    expect(ideas.some((idea) => idea.kind === 'unplaylisted_favourites')).toBe(true)
  })
})

describe('ideaMatchesTrack', () => {
  it('matches each filter kind', () => {
    const track = tk({ genres: ['Shoegaze'], year: 1991, rating: 9, playCount: 0, artistId: 'ar9' })
    expect(ideaMatchesTrack(track, { kind: 'genre', genre: 'shoegaze' })).toBe(true)
    expect(ideaMatchesTrack(track, { kind: 'genre', genre: 'jazz' })).toBe(false)
    expect(ideaMatchesTrack(track, { kind: 'decade', decade: 1990 })).toBe(true)
    expect(ideaMatchesTrack(track, { kind: 'artist', artistId: 'ar9', artistName: 'X' })).toBe(true)
    expect(ideaMatchesTrack(track, { kind: 'unplaylisted_favourites' })).toBe(true)
    expect(ideaMatchesTrack(track, { kind: 'unplayed_additions' })).toBe(true)
    expect(ideaMatchesTrack({ ...track, playCount: 3 }, { kind: 'unplayed_additions' })).toBe(false)
  })
})
