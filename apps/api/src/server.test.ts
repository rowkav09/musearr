import { getConfig } from '@musearr/config'
import type { Database } from '@musearr/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildServer } from './server.js'

const apps: ReturnType<typeof buildServer>[] = []

function createServer(options: {
  database?: Database
  jobQueue?: { send: ReturnType<typeof vi.fn> }
  webhookSecret?: string
} = {}) {
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
      { singletonKey: '9ad3649a-a78f-4aea-99dc-473c7c1c5501', singletonSeconds: 60 },
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
})
