import { afterEach, describe, expect, it, vi } from 'vitest'
import { LidarrClient, LidarrConnectionError, normaliseLidarrBaseUrl } from './client.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('normaliseLidarrBaseUrl', () => {
  it('keeps a bare origin and strips a trailing slash', () => {
    expect(normaliseLidarrBaseUrl('http://lidarr.local:8686/')).toBe('http://lidarr.local:8686')
  })

  it('rejects credentials, query strings, and non-http schemes', () => {
    expect(() => normaliseLidarrBaseUrl('http://user:pass@lidarr.local')).toThrow(LidarrConnectionError)
    expect(() => normaliseLidarrBaseUrl('http://lidarr.local?apikey=x')).toThrow(LidarrConnectionError)
    expect(() => normaliseLidarrBaseUrl('ftp://lidarr.local')).toThrow(LidarrConnectionError)
    expect(() => normaliseLidarrBaseUrl('not a url')).toThrow(LidarrConnectionError)
  })
})

describe('LidarrClient error mapping', () => {
  it('maps 401 responses to an UNAUTHENTICATED error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 })),
    )
    const client = new LidarrClient('http://lidarr.local', 'api-key-value')
    await expect(client.systemStatus()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('maps network failures to an UNREACHABLE error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )
    const client = new LidarrClient('http://lidarr.local', 'api-key-value')
    await expect(client.systemStatus()).rejects.toMatchObject({ code: 'UNREACHABLE' })
  })

  it('normalises a valid system status payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ version: '2.5.3.4341', instanceName: 'Lidarr' })),
    )
    const client = new LidarrClient('http://lidarr.local', 'api-key-value')
    await expect(client.systemStatus()).resolves.toEqual({ version: '2.5.3.4341', instanceName: 'Lidarr' })
  })
})
