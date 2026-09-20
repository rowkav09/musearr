import { describe, expect, it, vi } from 'vitest'
import { MusicBrainzSimilarTrackProvider } from './provider.js'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const seed = { artistName: 'Slowdive', trackTitle: 'Alison', albumTitle: 'Souvlaki', genres: ['Shoegaze'] }

describe('MusicBrainzSimilarTrackProvider', () => {
  it('resolves the seed, then returns neighbours, filling metadata via lookup when missing', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/recording?query=')) {
        return jsonResponse({ recordings: [{ id: 'seed-mbid', score: 99 }] })
      }
      if (url.includes('/similar-recordings/json')) {
        return jsonResponse([
          { recording_mbid: 'n1', score: 0.9, recording_name: 'Vapour Trail', artist_credit_name: 'Ride' },
          { recording_mbid: 'n2', score: 0.8 },
        ])
      }
      if (url.includes('/recording/n2')) {
        return jsonResponse({
          title: 'Pearl',
          'artist-credit': [{ name: 'Chapterhouse' }],
          releases: [{ title: 'Whirlpool' }],
        })
      }
      throw new Error(`unexpected url ${url}`)
    })

    const provider = new MusicBrainzSimilarTrackProvider({
      contact: 'ops@example.com',
      minRequestIntervalMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const suggestions = await provider.findSimilar(seed, 5)
    expect(suggestions).toEqual([
      { artistName: 'Ride', trackTitle: 'Vapour Trail', albumTitle: null, source: 'musicbrainz' },
      { artistName: 'Chapterhouse', trackTitle: 'Pearl', albumTitle: 'Whirlpool', source: 'musicbrainz' },
    ])
  })

  it('returns an empty list when the seed cannot be resolved', async () => {
    const provider = new MusicBrainzSimilarTrackProvider({
      contact: 'ops@example.com',
      minRequestIntervalMs: 0,
      fetchImpl: (async () => jsonResponse({ recordings: [] })) as unknown as typeof fetch,
    })
    await expect(provider.findSimilar(seed, 5)).resolves.toEqual([])
  })

  it('degrades to an empty list when MusicBrainz errors', async () => {
    const provider = new MusicBrainzSimilarTrackProvider({
      contact: 'ops@example.com',
      minRequestIntervalMs: 0,
      fetchImpl: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
    })
    await expect(provider.findSimilar(seed, 5)).resolves.toEqual([])
  })
})
