import { describe, expect, it, vi } from 'vitest'
import { phraseRecommendationSummaries, type PhrasableRecommendation } from './reason-phrasing.js'
import { NullLocalAiProvider, type LocalAiProvider } from './provider.js'

const item: PhrasableRecommendation = {
  trackTitle: 'Alison',
  artistName: 'Slowdive',
  albumTitle: 'Souvlaki',
  kind: 'daily_mix',
  summary: 'Slowdive fits one of the artists you return to most.',
  reasons: [{ code: 'FAVOURITE_ARTIST', weight: 0.8 }],
}

function providerReturning(complete: (typeof NullLocalAiProvider.prototype)['complete']): LocalAiProvider {
  return {
    name: 'ollama',
    enabled: true,
    model: 'test',
    baseUrl: 'http://x',
    isReachable: async () => true,
    complete,
    embed: async () => [],
  }
}

describe('phraseRecommendationSummaries', () => {
  it('returns every summary unchanged and marked deterministic when the provider is disabled', async () => {
    const out = await phraseRecommendationSummaries(new NullLocalAiProvider(), [item, item])
    expect(out).toEqual([
      { summary: item.summary, phrasing: 'deterministic' },
      { summary: item.summary, phrasing: 'deterministic' },
    ])
  })

  it('adopts a clean one-sentence rewrite and marks it local_ai', async () => {
    const complete = vi.fn().mockResolvedValue('Slowdive is one of the artists you keep coming back to.')
    const out = await phraseRecommendationSummaries(providerReturning(complete), [item])
    expect(out[0]).toEqual({
      summary: 'Slowdive is one of the artists you keep coming back to.',
      phrasing: 'local_ai',
    })
    expect(complete).toHaveBeenCalledOnce()
  })

  it('falls back to the deterministic sentence for empty, multi-sentence, or over-long output', async () => {
    const cases = [
      '',
      '   ',
      'Here is a nicer version:\nSlowdive is a favourite of yours.',
      'You love Slowdive. They are on this list because of that.',
      'x'.repeat(400),
    ]
    for (const bad of cases) {
      const out = await phraseRecommendationSummaries(
        providerReturning(vi.fn().mockResolvedValue(bad)),
        [item],
      )
      expect(out[0]).toEqual({ summary: item.summary, phrasing: 'deterministic' })
    }
  })

  it('strips a single pair of wrapping quotes', async () => {
    const out = await phraseRecommendationSummaries(
      providerReturning(vi.fn().mockResolvedValue('"Slowdive is a familiar favourite of yours."')),
      [item],
    )
    expect(out[0]).toEqual({
      summary: 'Slowdive is a familiar favourite of yours.',
      phrasing: 'local_ai',
    })
  })

  it('falls back for a single item when the model call throws, keeping the rest', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error('model error'))
      .mockResolvedValueOnce('A considered pick from your own library today.')
    const out = await phraseRecommendationSummaries(providerReturning(complete), [item, item])
    expect(out[0]).toEqual({ summary: item.summary, phrasing: 'deterministic' })
    expect(out[1]).toEqual({
      summary: 'A considered pick from your own library today.',
      phrasing: 'local_ai',
    })
  })

  it('honours maxItems, leaving later items deterministic without a model call', async () => {
    const complete = vi.fn().mockResolvedValue('One of your reliable favourites resurfaces here.')
    const out = await phraseRecommendationSummaries(providerReturning(complete), [item, item, item], {
      maxItems: 1,
    })
    expect(complete).toHaveBeenCalledOnce()
    expect(out[1]?.phrasing).toBe('deterministic')
    expect(out[2]?.phrasing).toBe('deterministic')
  })
})
