import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { getConfig, type MusearrConfig } from '@musearr/config'
import {
  CompleteSetupRequestSchema,
  PlexConnectionRequestSchema,
  QueueLibrarySyncRequestSchema,
  QueueRecommendationRunRequestSchema,
  RecommendationQuerySchema,
  type SetupStatus,
  SystemStatusSchema,
} from '@musearr/contracts'
import { encryptSecret, hashPassword, MUSEARR_VERSION, verifyPassword } from '@musearr/core'
import {
  createDatabase,
  getDatabaseStatus,
  getLibrarySyncSources,
  getLatestRecommendations,
  getSetupStatus,
  insertInitialSetup,
  LIBRARY_SYNC_QUEUE,
  RECOMMENDATION_RUN_QUEUE,
  startJobQueue,
  type Database,
} from '@musearr/db'
import { PlexClient, PlexConnectionError, normalisePlexBaseUrl } from '@musearr/plex'
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'
import type { PgBoss } from 'pg-boss'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: 'owner' | 'member' }
    user: { sub: string; role: 'owner' | 'member' }
  }
}

type ServerOptions = {
  config?: MusearrConfig
  database?: Database
}

const SESSION_COOKIE = 'musearr_session'

function sendProblem(
  reply: FastifyReply,
  status: number,
  code: string,
  detail: string,
): FastifyReply {
  return reply.code(status).send({
    type: `https://musearr.local/problems/${code.toLowerCase()}`,
    title: status >= 500 ? 'Musearr could not complete that request.' : 'Musearr needs your attention.',
    status,
    detail,
    code,
  })
}

function sessionSecret(config: MusearrConfig): string {
  if (config.MUSEARR_SESSION_SECRET) {
    return config.MUSEARR_SESSION_SECRET
  }
  if (config.NODE_ENV !== 'production') {
    return 'development-only-session-secret-change-before-production'
  }
  throw new Error('MUSEARR_SESSION_SECRET is required in production.')
}

function configurationForSetup(config: MusearrConfig): string | null {
  return config.MUSEARR_ENCRYPTION_KEY ?? null
}

function setSession(reply: FastifyReply, user: { id: string; role: 'owner' | 'member' }): void {
  const token = reply.server.jwt.sign({ sub: user.id, role: user.role })
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: reply.request.protocol === 'https',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const config = options.config ?? getConfig()
  const database = options.database ?? createDatabase(config.DATABASE_URL)
  const ownsDatabase = !options.database
  let jobQueue: PgBoss | null = null
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: {
        paths: [
          'req.headers.x-plex-token',
          'req.headers.authorization',
          'req.body.token',
          'req.body.ownerPassword',
        ],
        censor: '[REDACTED]',
      },
    },
  })

  app.register(cors, {
    origin: config.MUSEARR_WEB_ORIGIN,
    credentials: true,
  })
  app.register(cookie)
  app.register(jwt, { secret: sessionSecret(config), cookie: { cookieName: SESSION_COOKIE, signed: false } })
  app.register(swagger, {
    openapi: {
      info: { title: 'Musearr API', version: MUSEARR_VERSION },
    },
  })
  app.register(swaggerUi, { routePrefix: '/documentation' })

  app.addHook('onReady', async () => {
    jobQueue = await startJobQueue(config.DATABASE_URL, (error) => app.log.error(error, 'Job queue error'))
  })

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error)
    if (typeof error === 'object' && error !== null && 'validation' in error) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'One or more fields need to be corrected.')
    }
    return sendProblem(reply, 500, 'INTERNAL_ERROR', 'Try again shortly. The detailed error is available only in local logs.')
  })

  app.get('/api/v1/system/health', async (_request, reply) => {
    const databaseStatus = await getDatabaseStatus(database)
    const status = databaseStatus === 'connected' ? 'healthy' : 'degraded'
    const payload = SystemStatusSchema.parse({
      status,
      version: MUSEARR_VERSION,
      database: databaseStatus,
      checkedAt: new Date().toISOString(),
    })
    return reply.code(status === 'healthy' ? 200 : 503).send(payload)
  })

  app.get('/api/v1/setup/status', async (_request, reply) => {
    const databaseStatus = await getDatabaseStatus(database)
    if (databaseStatus === 'unavailable') {
      return sendProblem(reply, 503, 'DATABASE_UNAVAILABLE', 'Musearr cannot reach its local database.')
    }

    const status = await getSetupStatus(database)
    const payload: SetupStatus = {
      phase: status.configured ? 'configured' : 'unconfigured',
      plexServer: status.plexServer,
    }
    return reply.send(payload)
  })

  app.post('/api/v1/setup/test-plex', async (request, reply) => {
    const parsed = PlexConnectionRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Enter a Plex server URL and token.')
    }

    try {
      const result = await new PlexClient(parsed.data.baseUrl, parsed.data.token).testConnection()
      return reply.send(result)
    } catch (error) {
      if (error instanceof PlexConnectionError) {
        return sendProblem(reply, error.code === 'UNAUTHENTICATED' ? 401 : 422, error.code, error.message)
      }
      throw error
    }
  })

  app.post('/api/v1/setup/complete', async (request, reply) => {
    const parsed = CompleteSetupRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Review the Plex connection, local owner, and selected music libraries.')
    }

    const encryptionKey = configurationForSetup(config)
    if (!encryptionKey) {
      return sendProblem(reply, 503, 'MISSING_ENCRYPTION_KEY', 'Set MUSEARR_ENCRYPTION_KEY before saving a Plex connection.')
    }

    const existing = await getSetupStatus(database)
    if (existing.configured) {
      return sendProblem(reply, 409, 'INSTANCE_ALREADY_CONFIGURED', 'This Musearr instance has already been configured.')
    }

    try {
      const connection = await new PlexClient(parsed.data.baseUrl, parsed.data.token).testConnection()
      const selectedIds = new Set(parsed.data.selectedLibraryIds)
      const selectedLibraries = connection.musicLibraries.filter((library) => selectedIds.has(library.id))
      if (selectedLibraries.length !== selectedIds.size) {
        return sendProblem(reply, 400, 'INVALID_LIBRARY_SELECTION', 'Select only music libraries returned by Plex.')
      }

      const result = await insertInitialSetup(database, {
        ownerUsername: parsed.data.ownerUsername,
        passwordHash: await hashPassword(parsed.data.ownerPassword),
        machineIdentifier: connection.machineIdentifier,
        serverName: connection.serverName,
        baseUrl: normalisePlexBaseUrl(parsed.data.baseUrl),
        tokenCiphertext: encryptSecret(parsed.data.token, encryptionKey),
        selectedLibraries: selectedLibraries.map((library) => ({
          plexSectionId: library.id,
          title: library.title,
        })),
      })
      const readyJobQueue = jobQueue
      let initialJobIds: Array<string | null> = []
      if (readyJobQueue) {
        try {
          initialJobIds = await Promise.all(
            (await getLibrarySyncSources(database)).map((source) =>
              readyJobQueue.send(LIBRARY_SYNC_QUEUE, {
                librarySectionId: source.librarySectionId,
                trigger: 'initial-setup',
              }),
            ),
          )
        } catch (queueError) {
          app.log.error(queueError, 'Initial Plex sync could not be queued after setup')
        }
      }
      setSession(reply, result.user)
      return reply.code(201).send({
        user: { username: result.user.username, role: result.user.role },
        plexServer: { name: result.server.name, machineIdentifier: result.server.machineIdentifier },
        initialJobIds,
      })
    } catch (error) {
      if (error instanceof PlexConnectionError) {
        return sendProblem(reply, error.code === 'UNAUTHENTICATED' ? 401 : 422, error.code, error.message)
      }
      if (error instanceof Error && error.message === 'INSTANCE_ALREADY_CONFIGURED') {
        return sendProblem(reply, 409, 'INSTANCE_ALREADY_CONFIGURED', 'This Musearr instance has already been configured.')
      }
      throw error
    }
  })

  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = request.body as { username?: unknown; password?: unknown }
    if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Enter your local owner credentials.')
    }

    const users = await database<Array<{ id: string; password_hash: string; role: 'owner' | 'member' }>>`
      SELECT id, password_hash, role FROM users
      WHERE username = ${body.username.trim()}
      AND disabled_at IS NULL
      LIMIT 1
    `
    const user = users[0]
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return sendProblem(reply, 401, 'INVALID_CREDENTIALS', 'The username or password is not correct.')
    }

    setSession(reply, { id: user.id, role: user.role })
    return reply.code(204).send()
  })

  app.get('/api/v1/auth/me', async (request, reply) => {
    try {
      await request.jwtVerify()
      return reply.send({ user: request.user })
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to continue.')
    }
  })

  app.post('/api/v1/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.code(204).send()
  })

  app.post('/api/v1/sync', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to start a library sync.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can start a library sync.')
    }

    const parsed = QueueLibrarySyncRequestSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid music library to sync.')
    }
    const readyJobQueue = jobQueue
    if (!readyJobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }

    const sources = await getLibrarySyncSources(database, parsed.data.librarySectionId)
    if (sources.length === 0) {
      return sendProblem(reply, 404, 'LIBRARY_NOT_FOUND', 'No selected Plex music library matched this request.')
    }

    const jobs = await Promise.all(
      sources.map(async (source) => ({
        librarySectionId: source.librarySectionId,
        jobId: await readyJobQueue.send(
          LIBRARY_SYNC_QUEUE,
          { librarySectionId: source.librarySectionId, trigger: 'manual' },
          { singletonKey: source.librarySectionId, singletonSeconds: 60 },
        ),
      })),
    )
    return reply.code(202).send({ jobs })
  })

  app.post('/api/v1/recommendations/runs', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to generate recommendations.')
    }

    const parsed = QueueRecommendationRunRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid recommendation type and length.')
    }
    const readyJobQueue = jobQueue
    if (!readyJobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }

    const jobId = await readyJobQueue.send(
      RECOMMENDATION_RUN_QUEUE,
      {
        userId: request.user.sub,
        kind: parsed.data.kind,
        limit: parsed.data.limit,
        trigger: 'manual',
      },
      { singletonKey: `${request.user.sub}:${parsed.data.kind}`, singletonSeconds: 30 },
    )
    return reply.code(202).send({ jobId, kind: parsed.data.kind })
  })

  app.get('/api/v1/recommendations', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view recommendations.')
    }

    const parsed = RecommendationQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid recommendation type.')
    }
    const recommendations = await getLatestRecommendations(database, request.user.sub, parsed.data.kind)
    return reply.send({ recommendations })
  })

  if (ownsDatabase) {
    app.addHook('onClose', async () => {
      await jobQueue?.stop()
      await database.end({ timeout: 5 })
    })
  }

  return app
}
