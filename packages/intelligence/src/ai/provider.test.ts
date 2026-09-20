import { describe, expect, it } from 'vitest'
import { createLocalAiProvider } from './index.js'
import { LocalAiSimilarTrackProvider, parseSuggestions } from './similar.js'
import { LocalAiUnavailableError, NullLocalAiProvider } from './provider.js'

describe('createLocalAiProvider', () => {
  it('returns the null provider unless fully configured and enabled', () => {
    expect(createLocalAiProvider({ enabled: false, provider: 'none' }).enabled).toBe(false)
    expect(createLocalAiProvider({ enabled: true, provider: 'ollama' }).enabled).toBe(false)
    expect(
      createLocalAiProvider({ enabled: true, provider: 'ollama', baseUrl: 'http://x:11434' }).enabled,
    ).toBe(false)
  })

  it('returns an ollama provider when enabled with a base url and model', () => {
    const provider = createLocalAiProvider({
      enabled: true,
      provider: 'ollama',
      baseUrl: 'http://ollama.local:11434',
      model: 'llama3.1',
    })
    expect(provider).toMatchObject({ name: 'ollama', enabled: true, model: 'llama3.1' })
  })
})

describe('NullLocalAiProvider', () => {
  it('reports itself unreachable and throws on use', async () => {
    const provider = new NullLocalAiProvider()
    await expect(provider.isReachable()).resolves.toBe(false)
    await expect(provider.complete({ prompt: 'x' })).rejects.toBeInstanceOf(LocalAiUnavailableError)
  })
})

describe('LocalAiSimilarTrackProvider', () => {
  const seed = { artistName: 'Slowdive', trackTitle: 'Alison', albumTitle: 'Souvlaki', genres: ['Shoegaze'] }

  it('returns nothing when the provider is disabled', async () => {
    const provider = new LocalAiSimilarTrackProvider(new NullLocalAiProvider())
    await expect(provider.findSimilar(seed, 5)).resolves.toEqual([])
  })

  it('degrades to an empty list when the model output is not parseable', () => {
    expect(parseSuggestions('the model refused to answer', 'test')).toEqual([])
  })

  it('parses a JSON array embedded in model prose', () => {
    const raw = 'Sure!\n[{"artist":"Ride","title":"Vapour Trail","album":"Nowhere"},{"artist":"","title":"skip"}]\nEnjoy'
    expect(parseSuggestions(raw, 'local-ai:ollama')).toEqual([
      { artistName: 'Ride', trackTitle: 'Vapour Trail', albumTitle: 'Nowhere', source: 'local-ai:ollama' },
    ])
  })
})
