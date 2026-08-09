import { randomUUID } from 'node:crypto'
import { PlexClient, PlexConnectionError, normalisePlexBaseUrl } from '@musearr/plex'

const PLEX_API = 'https://plex.tv/api/v2'
const PRODUCT = 'Musearr'
const VERSION = '0.1.0'
const SESSION_TTL_MS = 10 * 60 * 1_000

export class PlexAuthNetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlexAuthNetworkError'
  }
}

async function plexFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    const cause =
      error instanceof Error && 'cause' in error
        ? (error as Error & { cause?: { code?: string } }).cause
        : undefined

    if (cause?.code === 'EAI_AGAIN' || cause?.code === 'ENOTFOUND') {
      throw new PlexAuthNetworkError(
        'Musearr cannot resolve plex.tv. Check Docker DNS and try again.',
      )
    }

    if (cause?.code === 'ECONNREFUSED' || cause?.code === 'ETIMEDOUT') {
      throw new PlexAuthNetworkError(
        'Musearr cannot reach Plex over the network. Check Docker networking and try again.',
      )
    }

    throw error
  }
}

type PlexPin = {
  id: number
  code: string
  authToken: string | null
  expiresIn: number
  createdAt: string
}

type PlexResource = {
  name: string
  provides?: string
  owned?: boolean
  accessToken?: string
  connections?: Array<{
    uri: string
    local?: boolean
    relay?: boolean
    protocol?: string
  }>
}

type StoredConnection = {
  token: string
  baseUrl: string
  expiresAt: number
}

type PendingPin = {
  code: string
  expiresAt: number
}

const connections = new Map<string, StoredConnection>()
const pendingPins = new Map<number, PendingPin>()

function plexHeaders(clientIdentifier: string, token?: string): HeadersInit {
  return {
    accept: 'application/json',
    'X-Plex-Product': PRODUCT,
    'X-Plex-Version': VERSION,
    'X-Plex-Client-Identifier': clientIdentifier,
    ...(token ? { 'X-Plex-Token': token } : {}),
  }
}

function cleanup(): void {
  const now = Date.now()

  for (const [id, connection] of connections) {
    if (connection.expiresAt <= now) {
      connections.delete(id)
    }
  }

  for (const [id, pin] of pendingPins) {
    if (pin.expiresAt <= now) {
      pendingPins.delete(id)
    }
  }
}

export async function startPlexPin(clientIdentifier: string, webOrigin: string) {
  cleanup()

  const response = await plexFetch(`${PLEX_API}/pins?strong=true`, {
    method: 'POST',
    headers: plexHeaders(clientIdentifier),
  })

  if (!response.ok) {
    throw new Error(`Plex PIN creation failed with HTTP ${response.status}.`)
  }

  const pin = (await response.json()) as PlexPin
  const expiresAt = Date.now() + pin.expiresIn * 1_000

  pendingPins.set(pin.id, {
    code: pin.code,
    expiresAt,
  })

  const forwardUrl = `${webOrigin.replace(/\/$/, '')}/setup/plex-complete`
  const authParameters = new URLSearchParams({
    clientID: clientIdentifier,
    code: pin.code,
    forwardUrl,
    'context[device][product]': PRODUCT,
  })

  const authUrl = `https://app.plex.tv/auth#?${authParameters.toString()}`

  return {
    pinId: pin.id,
    authUrl,
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

function candidateUrls(resources: PlexResource[]): Array<{ url: string; token: string }> {
  const candidates: Array<{ url: string; token: string; score: number }> = []

  for (const resource of resources) {
    if (!resource.provides?.split(',').includes('server') || !resource.accessToken) {
      continue
    }

    candidates.push({
      url: 'http://host.docker.internal:32400',
      token: resource.accessToken,
      score: 150,
    })

    for (const connection of resource.connections ?? []) {
      if (!connection.uri) {
        continue
      }

      let url = connection.uri.replace(/\/$/, '')

      try {
        const parsed = new URL(url)

        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
          parsed.hostname = 'host.docker.internal'
          url = parsed.toString().replace(/\/$/, '')
        }
      } catch {
        continue
      }

      const score =
        (connection.local ? 100 : 0) +
        (!connection.relay ? 20 : 0) +
        (connection.protocol === 'http' ? 5 : 0) +
        (resource.owned ? 3 : 0)

      candidates.push({
        url,
        token: resource.accessToken,
        score,
      })
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .filter(
      (candidate, index, all) =>
        all.findIndex(
          (other) => other.url === candidate.url && other.token === candidate.token,
        ) === index,
    )
    .map(({ url, token }) => ({ url, token }))
}

async function discoverConnection(token: string, clientIdentifier: string) {
  const response = await plexFetch(
    `${PLEX_API}/resources?includeHttps=1&includeRelay=1`,
    {
      headers: plexHeaders(clientIdentifier, token),
    },
  )

  if (!response.ok) {
    throw new Error(`Plex server discovery failed with HTTP ${response.status}.`)
  }

  const resources = (await response.json()) as PlexResource[]
  const candidates = candidateUrls(resources)

  for (const candidate of candidates) {
    try {
      const baseUrl = normalisePlexBaseUrl(candidate.url)
      const connection = await new PlexClient(
        baseUrl,
        candidate.token,
      ).testConnection()

      return {
        baseUrl,
        token: candidate.token,
        connection,
      }
    } catch (error) {
      if (!(error instanceof PlexConnectionError)) {
        throw error
      }
    }
  }

  throw new PlexConnectionError(
    'UNREACHABLE',
    'Plex approved access, but Musearr could not reach any advertised Plex server address.',
  )
}

export async function pollPlexPin(pinId: number, clientIdentifier: string) {
  cleanup()

  const pendingPin = pendingPins.get(pinId)

  if (!pendingPin) {
    return {
      status: 'waiting' as const,
    }
  }

  const pollUrl = new URL(`${PLEX_API}/pins/${pinId}`)
  pollUrl.searchParams.set('code', pendingPin.code)

  const response = await plexFetch(pollUrl.toString(), {
    headers: plexHeaders(clientIdentifier),
  })

  if (!response.ok) {
    throw new Error(`Plex PIN check failed with HTTP ${response.status}.`)
  }

  const pin = (await response.json()) as PlexPin

  if (!pin.authToken) {
    return {
      status: 'waiting' as const,
    }
  }

  pendingPins.delete(pinId)

  const discovered = await discoverConnection(
    pin.authToken,
    clientIdentifier,
  )

  const connectionId = randomUUID()

  connections.set(connectionId, {
    token: discovered.token,
    baseUrl: discovered.baseUrl,
    expiresAt: Date.now() + SESSION_TTL_MS,
  })

  return {
    status: 'connected' as const,
    connectionId,
    connection: discovered.connection,
  }
}

export function getPendingPlexConnection(
  connectionId: string,
): StoredConnection | null {
  cleanup()
  return connections.get(connectionId) ?? null
}

export function consumePendingPlexConnection(connectionId: string): void {
  connections.delete(connectionId)
}
