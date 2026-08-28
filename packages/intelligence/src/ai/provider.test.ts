import { describe, expect, it, vi } from 'vitest'
import { createLocalAiProvider, resolveLocalAiConfig } from './index.js'
import { OllamaLocalAiProvider } from './ollama.js'
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

describe('resolveLocalAiConfig', () => {
  const environment = {
    enabled: true,
    provider: 'ollama' as const,
    baseUrl: 'http://env:11434',
    model: 'env-model',
    keepAliveSeconds: null,
  }

  it('uses the environment when there is no override', () => {
    expect(resolveLocalAiConfig(environment, null)).toBe(environment)
  })

  it('lets a stored override replace the environment wholesale', () => {
    const override = {
      enabled: false,
      provider: 'none' as const,
      baseUrl: undefined,
      model: undefined,
      keepAliveSeconds: 0,
    }
    expect(resolveLocalAiConfig(environment, override)).toBe(override)
  })
})

describe('OllamaLocalAiProvider keep_alive', () => {
  function stubOkFetch() {
    return vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'ok', embedding: [0.1] }),
    } as unknown as Response)
  }

  it('omits keep_alive when no value is configured', async () => {
    const fetchImpl = stubOkFetch()
    await new OllamaLocalAiProvider({
      baseUrl: 'http://ollama.local:11434',
      model: 'm',
      fetchImpl,
    }).complete({ prompt: 'hi' })

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('keep_alive')
  })

  it('sends keep_alive as a top-level field (not under options) for generate and embeddings', async () => {
    const fetchImpl = stubOkFetch()
    const provider = new OllamaLocalAiProvider({
      baseUrl: 'http://ollama.local:11434',
      model: 'm',
      keepAliveSeconds: -1,
      fetchImpl,
    })

    await provider.complete({ prompt: 'hi' })
    await provider.embed(['hello'])

    const generateBody = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(generateBody.keep_alive).toBe(-1)
    expect(generateBody.options).not.toHaveProperty('keep_alive')

    const embedBody = JSON.parse((fetchImpl.mock.calls[1]?.[1] as RequestInit).body as string)
    expect(embedBody.keep_alive).toBe(-1)
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
