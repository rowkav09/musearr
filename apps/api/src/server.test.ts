import { getConfig } from '@musearr/config'
import type { Database } from '@musearr/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildServer } from './server.js'

const apps: ReturnType<typeof buildServer>[] = []

function createServer(
  options: {
    database?: Database
    jobQueue?: { send: ReturnType<typeof vi.fn> }
    webhookSecret?: string
  } = {},
) {
  const app = buildServer({
    config: getConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://musearr:musearr@localhost:5432/musearr',
      MUSEARR_WEB_ORIGIN: 'https://musearr.test',
      MUSEARR_TRUST_PROXY: 'true',
      MUSEARR_SESSION_SECRET: 'a-session-secret-that-is-at-least-thirty-two-characters',
      MUSEARR_PLEX_WEBHOOK_SECRET: options.webhookSecret,
    }),
    database: options.database ?? ({} as Database),
    startJobQueue: false,
    ...(options.jobQueue ? { jobQueue: options.jobQueue } : {}),
  })
  apps.push(app)
  return app
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('Plex webhooks', () => {
  it('does not expose the webhook receiver until a secret is configured', async () => {
    const boundary = 'musearr-disabled-webhook-test'
    const response = await createServer().inject({
      method: 'POST',
      url: '/api/v1/webhooks/plex',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: [
        `--${boundary}`,
        'Content-Disposition: form-data; name="payload"',
        '',
        JSON.stringify({ event: 'library.new' }),
        `--${boundary}--`,
        '',
      ].join('\r\n'),
    })

    expect(response.statusCode).toBe(404)
  }, 15_000)

  it('queues a matching selected music library from a multipart Plex event', async () => {
    const sourceDatabase = (async () => [
      {
        plex_server_id: 'server-id',
        machine_identifier: 'server-machine',
        library_section_id: '9ad3649a-a78f-4aea-99dc-473c7c1c5501',
        plex_section_id: '7',
        server_name: 'Plex',
        base_url: 'http://plex.local:32400',
        token_ciphertext: 'ciphertext',
        owner_user_id: 'owner-id',
      },
    ]) as unknown as Database
    const send = vi.fn().mockResolvedValue('job-1')
    const secret = 'a-webhook-secret-that-is-at-least-thirty-two-characters'
    const boundary = 'musearr-webhook-test'
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="payload"',
      '',
      JSON.stringify({
        event: 'library.new',
        Server: { uuid: 'server-machine' },
        Metadata: { librarySectionID: 7, librarySectionType: 'artist' },
      }),
      `--${boundary}--`,
      '',
    ].join('\r\n')

    const response = await createServer({
      database: sourceDatabase,
      jobQueue: { send },
      webhookSecret: secret,
    }).inject({
      method: 'POST',
      url: `/api/v1/webhooks/plex?secret=${secret}`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    })

    expect(response.statusCode).toBe(204)
    expect(send).toHaveBeenCalledWith(
      'library.sync',
      {
        librarySectionId: '9ad3649a-a78f-4aea-99dc-473c7c1c5501',
        trigger: 'webhook',
      },
      {
        singletonKey: '9ad3649a-a78f-4aea-99dc-473c7c1c5501',
        singletonSeconds: 60,
      },
    )
  })
})

describe('browser mutation protections', () => {
  it('rejects a state-changing request from a different browser origin', async () => {
    const response = await createServer().inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin: 'https://untrusted.example' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: 'CROSS_ORIGIN_REQUEST' })
  })

  it('accepts the configured origin and clears a proxy-secure session cookie', async () => {
    const response = await createServer().inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        origin: 'https://musearr.test',
        'x-forwarded-proto': 'https',
      },
    })

    expect(response.statusCode).toBe(204)
    expect(response.headers['set-cookie']).toContain('HttpOnly')
    expect(response.headers['set-cookie']).toContain('Secure')
    expect(response.headers['set-cookie']).toContain('SameSite=Lax')
  })
})

describe('dashboard', () => {
  it('requires a local session before exposing listening data', async () => {
    const response = await createServer().inject({
      method: 'GET',
      url: '/api/v1/dashboard',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('requires a local session before exposing a daily briefing', async () => {
    const response = await createServer().inject({
      method: 'GET',
      url: '/api/v1/daily-briefs/latest',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('requires a local session before listing sync runs', async () => {
    const response = await createServer().inject({ method: 'GET', url: '/api/v1/sync-runs' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('requires a local session before exposing a sync run', async () => {
    const response = await createServer().inject({
      method: 'GET',
      url: '/api/v1/sync-runs/9ad3649a-a78f-4aea-99dc-473c7c1c5501',
    })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('requires a local session before exposing listening insights', async () => {
    const response = await createServer().inject({
      method: 'GET',
      url: '/api/v1/insights/listening',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})


describe('sync run observability', () => {
  const runId = '9ad3649a-a78f-4aea-99dc-473c7c1c5501'
  const syncRunRow = {
    id: runId,
    library_section_id: '2d95d6bc-6d55-43ab-a2ea-217a954a92a1',
    library_title: 'Music',
    kind: 'manual-library-import',
    status: 'failed' as const,
    counts: { importedTracks: 4, skippedTracks: 2 },
    error_summary: 'authentication: Plex authentication was rejected.',
    started_at: '2026-08-06T07:00:00.000Z',
    finished_at: '2026-08-06T07:01:00.000Z',
    created_at: '2026-08-06T06:59:00.000Z',
  }

  async function sessionHeaders(app: ReturnType<typeof buildServer>, role: 'owner' | 'member' = 'owner') {
    await app.ready()
    return { cookie: `musearr_session=${app.jwt.sign({ sub: `${role}-id`, role })}` }
  }

  it('requires an authenticated owner to list sync runs', async () => {
    const app = createServer()
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/sync-runs' })
    const nonOwner = await app.inject({
      method: 'GET',
      url: '/api/v1/sync-runs',
      headers: await sessionHeaders(app, 'member'),
    })

    expect(unauthenticated.statusCode).toBe(401)
    expect(unauthenticated.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(nonOwner.statusCode).toBe(403)
    expect(nonOwner.json()).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns validated safe sync run values to the local owner', async () => {
    const database = (async () => [syncRunRow]) as unknown as Database
    const app = createServer({ database })
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/sync-runs',
      headers: await sessionHeaders(app),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      runs: [{
        id: runId,
        librarySectionId: '2d95d6bc-6d55-43ab-a2ea-217a954a92a1',
        libraryTitle: 'Music',
        kind: 'manual-library-import',
        status: 'failed',
        counts: { importedTracks: 4, skippedTracks: 2 },
        startedAt: '2026-08-06T07:00:00.000Z',
        finishedAt: '2026-08-06T07:01:00.000Z',
        createdAt: '2026-08-06T06:59:00.000Z',
        failure: { classification: 'authentication', summary: 'Plex authentication was rejected.' },
      }],
    })
  })

  it('validates ids and returns found or hidden missing records', async () => {
    const database = vi
      .fn()
      .mockResolvedValueOnce([syncRunRow])
      .mockResolvedValueOnce([]) as unknown as Database
    const app = createServer({ database })
    const headers = await sessionHeaders(app)

    const invalid = await app.inject({ method: 'GET', url: '/api/v1/sync-runs/not-a-uuid', headers })
    const found = await app.inject({ method: 'GET', url: `/api/v1/sync-runs/${runId}`, headers })
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/sync-runs/1394ed5a-2f78-492f-b0d1-5f37bc4218bc',
      headers,
    })

    expect(invalid.statusCode).toBe(400)
    expect(invalid.json()).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(found.statusCode).toBe(200)
    expect(found.json()).toMatchObject({ run: { id: runId, failure: { classification: 'authentication' } } })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toMatchObject({ code: 'SYNC_RUN_NOT_FOUND' })
  })
})

describe('Setup connection testing security', () => {
  it('blocks connection testing if already configured', async () => {
    // getSetupStatus returns user IDs/configured status
    const database = (async () => [{ id: 'some-user-id' }]) as unknown as Database
    const app = createServer({ database })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/setup/test-plex',
      payload: {
        baseUrl: 'http://localhost:32400',
        token: 'some-dummy-token-that-is-long-enough',
      },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({
      code: 'INSTANCE_ALREADY_CONFIGURED',
      detail: 'This Musearr instance has already been configured.',
    })
  })

  it('allows connection testing if unconfigured', async () => {
    const database = (async () => []) as unknown as Database
    const app = createServer({ database })

    // Stub PlexClient testConnection
    const testConnectionSpy = vi.spyOn(
      (await import('@musearr/plex')).PlexClient.prototype,
      'testConnection',
    ).mockResolvedValue({
      machineIdentifier: 'machine-id',
      serverName: 'Server Name',
      version: '1.0.0',
      musicLibraries: [],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/setup/test-plex',
      payload: {
        baseUrl: 'http://localhost:32400',
        token: 'some-dummy-token-that-is-long-enough',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      machineIdentifier: 'machine-id',
      serverName: 'Server Name',
    })

    testConnectionSpy.mockRestore()
  })
})

describe('Local AI settings', () => {
  async function ownerHeaders(app: ReturnType<typeof buildServer>, role: 'owner' | 'member' = 'owner') {
    await app.ready()
    return { cookie: `musearr_session=${app.jwt.sign({ sub: `${role}-id`, role })}` }
  }

  const overrideRow = {
    enabled: true,
    provider: 'ollama',
    base_url: 'http://ollama.local:11434',
    model: 'qwen2.5:3b',
    keep_alive_seconds: -1,
    auto_start: false,
    updated_at: new Date('2026-08-28T00:00:00.000Z'),
  }

  function recordingDatabase(handler: (query: string) => unknown[]) {
    const queries: string[] = []
    const tag = (async (strings: TemplateStringsArray) => {
      const query = strings.join(' ? ')
      queries.push(query)
      return handler(query)
    }) as unknown as Database
    ;(tag as unknown as { begin: (cb: (tx: Database) => unknown) => Promise<unknown> }).begin = (cb) =>
      Promise.resolve(cb(tag))
    return { database: tag, queries }
  }

  it('requires an authenticated owner', async () => {
    const app = createServer()
    const anon = await app.inject({ method: 'GET', url: '/api/v1/settings/local-ai' })
    const member = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/local-ai',
      headers: await ownerHeaders(app, 'member'),
    })
    expect(anon.statusCode).toBe(401)
    expect(member.statusCode).toBe(403)
  })

  it('reports the environment configuration when no override is stored', async () => {
    const { database } = recordingDatabase(() => [])
    const app = createServer({ database })
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/local-ai',
      headers: await ownerHeaders(app),
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      enabled: false,
      provider: 'none',
      model: null,
      baseUrl: null,
      keepAliveSeconds: null,
      autoStart: true,
      source: 'environment',
      reachable: null,
    })
  })

  it('reports the stored override when one exists', async () => {
    const { database } = recordingDatabase(() => [overrideRow])
    const app = createServer({ database })
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/local-ai',
      headers: await ownerHeaders(app),
    })
    expect(response.json()).toMatchObject({
      enabled: true,
      provider: 'ollama',
      baseUrl: 'http://ollama.local:11434',
      model: 'qwen2.5:3b',
      keepAliveSeconds: -1,
      autoStart: false,
      source: 'database',
    })
  })

  it('persists a full override on PUT and echoes it back', async () => {
    const { database, queries } = recordingDatabase((query) =>
      query.includes('INSERT INTO ai_settings') ? [overrideRow] : [],
    )
    const app = createServer({ database })
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/local-ai',
      headers: await ownerHeaders(app),
      payload: {
        enabled: true,
        provider: 'ollama',
        baseUrl: 'http://ollama.local:11434',
        model: 'qwen2.5:3b',
        keepAliveSeconds: -1,
        autoStart: false,
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ source: 'database', enabled: true, provider: 'ollama' })
    expect(queries.some((q) => q.includes('DELETE FROM ai_settings'))).toBe(true)
    expect(queries.some((q) => q.includes('INSERT INTO ai_settings'))).toBe(true)
  })

  it('rejects an incomplete override on PUT', async () => {
    const { database } = recordingDatabase(() => [])
    const app = createServer({ database })
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/local-ai',
      headers: await ownerHeaders(app),
      payload: { enabled: true, provider: 'ollama' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('clears the override on DELETE and falls back to the environment', async () => {
    const { database, queries } = recordingDatabase(() => [])
    const app = createServer({ database })
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/settings/local-ai',
      headers: await ownerHeaders(app),
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ source: 'environment' })
    expect(queries.some((q) => q.includes('DELETE FROM ai_settings'))).toBe(true)
  })

  it('probes a candidate endpoint without persisting it', async () => {
    const { OllamaLocalAiProvider } = await import('@musearr/intelligence')
    const reachableSpy = vi
      .spyOn(OllamaLocalAiProvider.prototype, 'isReachable')
      .mockResolvedValue(true)
    const app = createServer()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/local-ai/test',
      headers: await ownerHeaders(app),
      payload: { provider: 'ollama', baseUrl: 'http://ollama.local:11434', model: 'qwen2.5:3b' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ reachable: true })
    expect(reachableSpy).toHaveBeenCalledOnce()
    reachableSpy.mockRestore()
  })

  it('reports a non-ollama provider as unreachable without probing', async () => {
    const { OllamaLocalAiProvider } = await import('@musearr/intelligence')
    const reachableSpy = vi.spyOn(OllamaLocalAiProvider.prototype, 'isReachable')
    const app = createServer()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/local-ai/test',
      headers: await ownerHeaders(app),
      payload: { provider: 'none', baseUrl: 'http://ollama.local:11434', model: 'x' },
    })
    expect(response.json()).toEqual({ reachable: false })
    expect(reachableSpy).not.toHaveBeenCalled()
    reachableSpy.mockRestore()
  })
})
