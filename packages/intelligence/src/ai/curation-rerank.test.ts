import { describe, expect, it, vi } from 'vitest'
import { rerankCurationWithAi } from './curation-rerank.js'
import type { CurationProposalItem } from '../curation.js'
import { NullLocalAiProvider, type LocalAiProvider } from './provider.js'

function item(n: number): CurationProposalItem {
  return {
    trackId: `t${n}`,
    plexRatingKey: `rk${n}`,
    artistName: `Artist ${n}`,
    trackTitle: `Song ${n}`,
    score: 1 - n / 100,
    reasons: [],
  }
}

const shortlist = [item(1), item(2), item(3), item(4), item(5)]

function provider(complete: LocalAiProvider['complete']): LocalAiProvider {
  return {
    name: 'ollama',
    enabled: true,
    model: 'm',
    baseUrl: 'http://x',
    isReachable: async () => true,
    complete,
    embed: async () => [],
  }
}

const base = { playlistName: 'Focus', topArtists: ['Artist 1'], topGenres: ['ambient'], limit: 3 }

describe('rerankCurationWithAi', () => {
  it('returns the deterministic top-N unchanged when AI is disabled', async () => {
    const result = await rerankCurationWithAi(new NullLocalAiProvider(), { ...base, shortlist })
    expect(result.aiUsed).toBe(false)
    expect(result.items.map((i) => i.trackId)).toEqual(['t1', 't2', 't3'])
  })

  it('reorders to the model pick and tops up from deterministic order', async () => {
    const complete = vi.fn().mockResolvedValue('Sure: [3, 1]')
    const result = await rerankCurationWithAi(provider(complete), { ...base, shortlist })
    expect(result.aiUsed).toBe(true)
    // 3 and 1 from the model, then 2 to reach the limit of 3.
    expect(result.items.map((i) => i.trackId)).toEqual(['t3', 't1', 't2'])
  })

  it('ignores out-of-range and duplicate numbers', async () => {
    const complete = vi.fn().mockResolvedValue('[2, 2, 99, 5]')
    const result = await rerankCurationWithAi(provider(complete), { ...base, shortlist })
    expect(result.items.map((i) => i.trackId)).toEqual(['t2', 't5', 't1'])
    expect(result.aiUsed).toBe(true)
  })

  it('falls back to deterministic order on unparseable output', async () => {
    const result = await rerankCurationWithAi(
      provider(vi.fn().mockResolvedValue('no idea, sorry')),
      { ...base, shortlist },
    )
    expect(result.aiUsed).toBe(false)
    expect(result.items.map((i) => i.trackId)).toEqual(['t1', 't2', 't3'])
  })

  it('falls back when the model call throws', async () => {
    const result = await rerankCurationWithAi(
      provider(vi.fn().mockRejectedValue(new Error('down'))),
      { ...base, shortlist },
    )
    expect(result.aiUsed).toBe(false)
    expect(result.items).toHaveLength(3)
  })
})
