import { getConfig } from '@musearr/config'
import type { Database } from '@musearr/db'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer } from './server.js'

const apps: ReturnType<typeof buildServer>[] = []

function createServer() {
  const app = buildServer({
    config: getConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://musearr:musearr@localhost:5432/musearr',
      MUSEARR_WEB_ORIGIN: 'https://musearr.test',
      MUSEARR_TRUST_PROXY: 'true',
      MUSEARR_SESSION_SECRET: 'a-session-secret-that-is-at-least-thirty-two-characters',
    }),
    database: {} as Database,
    startJobQueue: false,
  })
  apps.push(app)
  return app
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
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
