import { describe, expect, it } from 'vitest'
import { clearAiSettings, getAiSettings, upsertAiSettings } from './ai-settings.js'
import type { Database } from './repository.js'

type QueryLog = string[]

/**
 * A minimal stand-in for the `postgres` tagged-template client: it records each
 * query and returns whatever the handler maps it to. `begin` runs the callback
 * with the same tag, which is all the singleton upsert needs.
 */
function fakeDatabase(handler: (query: string) => unknown[]): { database: Database; queries: QueryLog } {
  const queries: QueryLog = []
  const tag = (async (strings: TemplateStringsArray) => {
    const query = strings.join(' ? ')
    queries.push(query)
    return handler(query)
  }) as unknown as Database
  ;(tag as unknown as { begin: (cb: (tx: Database) => unknown) => Promise<unknown> }).begin = (cb) =>
    Promise.resolve(cb(tag))
  return { database: tag, queries }
}

const row = {
  enabled: true,
  provider: 'ollama',
  base_url: 'http://ollama.local:11434',
  model: 'qwen2.5:3b',
  keep_alive_seconds: -1,
  auto_start: true,
  updated_at: new Date('2026-08-28T00:00:00.000Z'),
}

describe('getAiSettings', () => {
  it('returns null when the singleton row is absent', async () => {
    const { database } = fakeDatabase(() => [])
    await expect(getAiSettings(database)).resolves.toBeNull()
  })

  it('maps the stored row to a camelCase record with an ISO timestamp', async () => {
    const { database } = fakeDatabase(() => [row])
    await expect(getAiSettings(database)).resolves.toEqual({
      enabled: true,
      provider: 'ollama',
      baseUrl: 'http://ollama.local:11434',
      model: 'qwen2.5:3b',
      keepAliveSeconds: -1,
      autoStart: true,
      updatedAt: '2026-08-28T00:00:00.000Z',
    })
  })
})

describe('upsertAiSettings', () => {
  it('clears then re-inserts the singleton and returns the new record', async () => {
    const { database, queries } = fakeDatabase((query) =>
      query.includes('INSERT INTO ai_settings') ? [{ ...row, keep_alive_seconds: null }] : [],
    )

    const saved = await upsertAiSettings(database, {
      enabled: true,
      provider: 'ollama',
      baseUrl: 'http://ollama.local:11434',
      model: 'qwen2.5:3b',
      keepAliveSeconds: null,
      autoStart: true,
    })

    expect(queries[0]).toContain('DELETE FROM ai_settings')
    expect(queries[1]).toContain('INSERT INTO ai_settings')
    expect(saved.keepAliveSeconds).toBeNull()
    expect(saved).toMatchObject({ enabled: true, provider: 'ollama', model: 'qwen2.5:3b' })
  })

  it('throws if the insert returns nothing', async () => {
    const { database } = fakeDatabase(() => [])
    await expect(
      upsertAiSettings(database, {
        enabled: false,
        provider: 'none',
        baseUrl: null,
        model: null,
        keepAliveSeconds: null,
        autoStart: true,
      }),
    ).rejects.toThrow('Failed to save AI settings.')
  })
})

describe('clearAiSettings', () => {
  it('deletes the singleton row', async () => {
    const { database, queries } = fakeDatabase(() => [])
    await clearAiSettings(database)
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('DELETE FROM ai_settings')
  })
})
