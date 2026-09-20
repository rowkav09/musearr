import { describe, expect, it } from 'vitest'
import { CompositeSimilarTrackProvider, NullSimilarTrackProvider, type SimilarTrackProvider } from './similar.js'
import type { ExternalTrackSuggestion } from './playlist.js'

function stubProvider(name: string, suggestions: ExternalTrackSuggestion[]): SimilarTrackProvider {
  return { name, findSimilar: async () => suggestions }
}

const seed = { artistName: 'Slowdive', trackTitle: 'Alison', albumTitle: null, genres: [] }

describe('CompositeSimilarTrackProvider', () => {
  it('merges providers in order, de-duplicating by artist and title, up to the limit', async () => {
    const composite = new CompositeSimilarTrackProvider([
      stubProvider('a', [
        { artistName: 'Ride', trackTitle: 'Vapour Trail', albumTitle: null, source: 'a' },
        { artistName: 'Lush', trackTitle: 'Sweetness and Light', albumTitle: null, source: 'a' },
      ]),
      stubProvider('b', [
        { artistName: 'ride', trackTitle: 'vapour trail', albumTitle: null, source: 'b' }, // duplicate
        { artistName: 'Chapterhouse', trackTitle: 'Pearl', albumTitle: null, source: 'b' },
      ]),
    ])

    const merged = await composite.findSimilar(seed, 3)
    expect(merged.map((s) => `${s.artistName}/${s.source}`)).toEqual([
      'Ride/a',
      'Lush/a',
      'Chapterhouse/b',
    ])
  })

  it('skips a provider that throws and continues with the rest', async () => {
    const throwing: SimilarTrackProvider = {
      name: 'boom',
      findSimilar: async () => {
        throw new Error('upstream down')
      },
    }
    const composite = new CompositeSimilarTrackProvider([
      throwing,
      stubProvider('ok', [{ artistName: 'Ride', trackTitle: 'Seagull', albumTitle: null, source: 'ok' }]),
    ])

    await expect(composite.findSimilar(seed, 5)).resolves.toEqual([
      { artistName: 'Ride', trackTitle: 'Seagull', albumTitle: null, source: 'ok' },
    ])
  })

  it('reports a combined name and is a no-op when empty', async () => {
    expect(new CompositeSimilarTrackProvider([stubProvider('musicbrainz', []), new NullSimilarTrackProvider()]).name).toBe(
      'musicbrainz+none',
    )
    await expect(new CompositeSimilarTrackProvider([]).findSimilar(seed, 5)).resolves.toEqual([])
  })
})
