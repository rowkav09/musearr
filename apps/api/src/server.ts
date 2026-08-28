import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { timingSafeEqual } from 'node:crypto'
import { getConfig, type MusearrConfig } from '@musearr/config'
import {
  CompleteSetupRequestSchema,
  DailyBriefResponseSchema,
  DashboardOverviewSchema,
  GeneratePlaylistRequestSchema,
  LidarrConnectionRequestSchema,
  LidarrConnectionResultSchema,
  LidarrConnectionStatusSchema,
  CreateCurationRequestSchema,
  CurationAcceptedSchema,
  CurationListResponseSchema,
  CurationResponseSchema,
  MirroredPlaylistListResponseSchema,
  AlbumListQuerySchema,
  AlbumListResponseSchema,
  BuildFromFilterRequestSchema,
  GenreListResponseSchema,
  LibraryHealthSchema,
  PlaylistBuildAcceptedSchema,
  LibraryTrackSearchQuerySchema,
  LibraryTrackSearchResponseSchema,
  ListeningInsightQuerySchema,
  ListeningInsightSummarySchema,
  LocalAiSettingsUpdateSchema,
  SetCurationItemDecisionRequestSchema,
  LocalAiStatusSchema,
  LocalAiTestRequestSchema,
  LocalAiTestResultSchema,
  MusicBrainzStatusSchema,
  PlaylistIdeaCreateAcceptedSchema,
  PlaylistIdeaListResponseSchema,
  PlaylistIdeaScanAcceptedSchema,
  PlaylistGenerationAcceptedSchema,
  PlaylistGenerationListResponseSchema,
  PlaylistGenerationResponseSchema,
  PlexConnectionRequestSchema,
  PlexPinCreateResponseSchema,
  PlexPinStatusResponseSchema,
  PlexWebhookPayloadSchema,
  QueueLibrarySyncRequestSchema,
  QueueRecommendationRunRequestSchema,
  SyncRunListResponseSchema,
  SyncRunResponseSchema,
  RecommendationQuerySchema,
  type SetupStatus,
  SystemStatusSchema,
} from '@musearr/contracts'
import { encryptSecret, hashPassword, MUSEARR_VERSION, verifyPassword } from '@musearr/core'
import {
  clearAiSettings,
  createCurationForRatingKey,
  createDatabase,
  createPlaylistGeneration,
  DAILY_BRIEF_QUEUE,
  getAiSettings,
  getCuration,
  getPlaylistIdea,
  listCuratablePlaylists,
  listCurations,
  listPlaylistIdeas,
  PLAYLIST_CURATION_APPLY_QUEUE,
  PLAYLIST_CURATION_QUEUE,
  PLAYLIST_IDEA_CREATE_QUEUE,
  PLAYLIST_IDEAS_SCAN_QUEUE,
  setCurationItemDecision,
  setPlaylistIdeaStatus,
  getDashboardOverview,
  getDatabaseStatus,
  getLibraryHealth,
  listAlbums,
  listGenres,
  PLAYLIST_BUILD_QUEUE,
  searchLibraryTracks,
  getLibrarySyncSources,
  getLatestRecommendations,
  getLatestDailyBrief,
  getListeningInsightSummary,
  getLidarrConnectionStatus,
  getPlaylistGeneration,
  getPlaylistSeedLabel,
  getSetupStatus,
  getSyncRun,
  listPlaylistGenerations,
  listSyncRuns,
  getUserTimezone,
  insertInitialSetup,
  LIBRARY_SYNC_QUEUE,
  PLAYLIST_GENERATION_QUEUE,
  PLAYLIST_SYNC_QUEUE,
  RECOMMENDATION_RUN_QUEUE,
  startJobQueue,
  upsertAiSettings,
  upsertLidarrConnection,
  type AiSettingsRecord,
  type Database,
} from '@musearr/db'
import { CURATION_ALGORITHM_VERSION, OllamaLocalAiProvider } from '@musearr/intelligence'
import {
  checkPlexPin,
  createPlexPin,
  listPlexServersForToken,
  PlexClient,
  PlexConnectionError,
  plexPinAuthUrl,
  normalisePlexBaseUrl,
} from '@musearr/plex'
import { LidarrClient, LidarrConnectionError, normaliseLidarrBaseUrl } from '@musearr/lidarr'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
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
  startJobQueue?: boolean
  jobQueue?: Pick<PgBoss, 'send'>
}

type ApiJobQueue = Pick<PgBoss, 'send'> & Partial<Pick<PgBoss, 'stop'>>

const SESSION_COOKIE = 'musearr_session'

function sendProblem(reply: FastifyReply, status: number, code: string, detail: string): FastifyReply {
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Returns `params.id` when it is a well-formed UUID, otherwise null. */
function uuidParam(params: unknown): string | null {
  const id = (params as { id?: unknown })?.id
  return typeof id === 'string' && UUID_RE.test(id) ? id : null
}

/**
 * The effective Local AI status: the persisted override when present, otherwise
 * the environment. `reachable` is always reported as unknown here; callers probe
 * it explicitly through the test endpoint.
 */
function localAiStatusPayload(config: MusearrConfig, override: AiSettingsRecord | null) {
  if (override) {
    return {
      enabled: override.enabled,
      // Coerce defensively, matching the worker: the write path is constrained,
      // but a hand-edited row should not 500 the status endpoint.
      provider: override.provider === 'ollama' ? 'ollama' : 'none',
      model: override.model,
      baseUrl: override.baseUrl,
      keepAliveSeconds: override.keepAliveSeconds,
      autoStart: override.autoStart,
      source: 'database' as const,
      reachable: null,
    }
  }
  return {
    enabled: config.MUSEARR_LOCAL_AI_ENABLED,
    provider: config.MUSEARR_LOCAL_AI_PROVIDER,
    model: config.MUSEARR_LOCAL_AI_MODEL ?? null,
    baseUrl: config.MUSEARR_LOCAL_AI_BASE_URL ?? null,
    keepAliveSeconds: null,
    autoStart: true,
    source: 'environment' as const,
    reachable: null,
  }
}

function sessionCookieOptions(request: FastifyReply['request']) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.protocol === 'https',
    path: '/',
  }
}

function setSession(reply: FastifyReply, user: { id: string; role: 'owner' | 'member' }): void {
  const token = reply.server.jwt.sign({ sub: user.id, role: user.role })
  reply.setCookie(SESSION_COOKIE, token, {
    ...sessionCookieOptions(reply.request),
    maxAge: 60 * 60 * 24 * 30,
  })
}

function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function isAllowedBrowserMutation(requestOrigin: string | undefined, webOrigin: string): boolean {
  if (!requestOrigin) {
    return true
  }

  try {
    return new URL(requestOrigin).origin === webOrigin
  } catch {
    return false
  }
}

function webhookSecretsMatch(expectedSecret: string | undefined, receivedSecret: unknown): boolean {
  if (!expectedSecret || typeof receivedSecret !== 'string') {
    return false
  }
  const expected = Buffer.from(expectedSecret)
  const received = Buffer.from(receivedSecret)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function isLibraryChangeEvent(event: string): boolean {
  return event.startsWith('library.')
}

async function drainMultipartRequest(request: FastifyRequest): Promise<void> {
  if (!request.isMultipart()) {
    return
  }

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      for await (const chunk of part.file) {
        // Plex may attach a thumbnail. Drain it without retaining media in memory.
        void chunk
      }
    }
  }
}

async function parsePlexWebhookPayload(request: FastifyRequest): Promise<unknown> {
  if (!request.isMultipart()) {
    return request.body
  }

  let payload: string | undefined
  for await (const part of request.parts()) {
    if (part.type === 'field') {
      if (part.fieldname === 'payload' && typeof part.value === 'string') {
        payload = part.value
      }
      continue
    }
    for await (const chunk of part.file) {
      // Plex may attach a thumbnail. Drain it without retaining media in memory.
      void chunk
    }
  }

  if (!payload) {
    return undefined
  }
  try {
    return JSON.parse(payload) as unknown
  } catch {
    return undefined
  }
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const config = options.config ?? getConfig()
  const database = options.database ?? createDatabase(config.DATABASE_URL)
  const ownsDatabase = !options.database
  let jobQueue: ApiJobQueue | null = options.jobQueue ?? null
  const app = Fastify({
    trustProxy: config.MUSEARR_TRUST_PROXY,
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: {
        paths: [
          'req.url',
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
  app.register(multipart, {
    limits: {
      fieldNameSize: 100,
      fieldSize: 64 * 1_024,
      fields: 2,
      fileSize: 1_024 * 1_024,
      files: 1,
      headerPairs: 100,
      parts: 3,
    },
  })
  app.register(jwt, {
    secret: sessionSecret(config),
    cookie: { cookieName: SESSION_COOKIE, signed: false },
  })
  app.register(swagger, {
    openapi: {
      info: { title: 'Musearr API', version: MUSEARR_VERSION },
    },
  })
  app.register(swaggerUi, { routePrefix: '/documentation' })

  app.addHook('onRequest', async (request, reply) => {
    if (isSafeMethod(request.method)) {
      return
    }
    if (!isAllowedBrowserMutation(request.headers.origin, config.MUSEARR_WEB_ORIGIN)) {
      sendProblem(reply, 403, 'CROSS_ORIGIN_REQUEST', 'Use Musearr from its configured web address.')
      return
    }
  })

  app.addHook('onReady', async () => {
    if (options.startJobQueue !== false && !jobQueue) {
      jobQueue = await startJobQueue(config.DATABASE_URL, (error) => app.log.error(error, 'Job queue error'))
    }
  })

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error)
    if (typeof error === 'object' && error !== null && 'validation' in error) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'One or more fields need to be corrected.')
    }
    return sendProblem(
      reply,
      500,
      'INTERNAL_ERROR',
      'Try again shortly. The detailed error is available only in local logs.',
    )
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
    const existing = await getSetupStatus(database)
    if (existing.configured) {
      return sendProblem(
        reply,
        409,
        'INSTANCE_ALREADY_CONFIGURED',
        'This Musearr instance has already been configured.',
      )
    }

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

  app.post('/api/v1/setup/plex-pin', async (_request, reply) => {
    const existing = await getSetupStatus(database)
    if (existing.configured) {
      return sendProblem(
        reply,
        409,
        'INSTANCE_ALREADY_CONFIGURED',
        'This Musearr instance has already been configured.',
      )
    }

    try {
      const pin = await createPlexPin()
      return reply.send(
        PlexPinCreateResponseSchema.parse({
          id: pin.id,
          code: pin.code,
          authUrl: plexPinAuthUrl(pin.code),
        }),
      )
    } catch (error) {
      if (error instanceof PlexConnectionError) {
        return sendProblem(reply, 502, error.code, 'Musearr could not start Plex sign-in. Try again.')
      }
      throw error
    }
  })

  app.get('/api/v1/setup/plex-pin/:id', async (request, reply) => {
    const existing = await getSetupStatus(database)
    if (existing.configured) {
      return sendProblem(
        reply,
        409,
        'INSTANCE_ALREADY_CONFIGURED',
        'This Musearr instance has already been configured.',
      )
    }

    const rawId = (request.params as { id?: unknown }).id
    const id = typeof rawId === 'string' ? Number(rawId) : NaN
    if (!Number.isInteger(id) || id <= 0) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Provide a valid Plex sign-in id.')
    }

    try {
      const { authToken } = await checkPlexPin(id)
      if (!authToken) {
        return reply.send(PlexPinStatusResponseSchema.parse({ authToken: null, servers: [] }))
      }
      const servers = await listPlexServersForToken(authToken)
      return reply.send(PlexPinStatusResponseSchema.parse({ authToken, servers }))
    } catch (error) {
      if (error instanceof PlexConnectionError) {
        return sendProblem(reply, 502, error.code, 'Musearr could not check Plex sign-in status. Try again.')
      }
      throw error
    }
  })

  app.post('/api/v1/webhooks/plex', async (request, reply) => {
    const query = request.query as { secret?: unknown }
    if (!webhookSecretsMatch(config.MUSEARR_PLEX_WEBHOOK_SECRET, query.secret)) {
      await drainMultipartRequest(request)
      return reply.code(404).send()
    }

    const parsed = PlexWebhookPayloadSchema.safeParse(await parsePlexWebhookPayload(request))
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_WEBHOOK', 'Musearr could not read the Plex webhook payload.')
    }
    if (!isLibraryChangeEvent(parsed.data.event)) {
      return reply.code(204).send()
    }

    const plexSectionId = parsed.data.Metadata?.librarySectionID
    const machineIdentifier = parsed.data.Server?.uuid
    if (!plexSectionId || !machineIdentifier) {
      return reply.code(204).send()
    }

    const sources = await getLibrarySyncSources(database)
    const source = sources.find(
      (candidate) => candidate.machineIdentifier === machineIdentifier && candidate.plexSectionId === plexSectionId,
    )
    if (!source) {
      return reply.code(204).send()
    }

    if (!jobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }

    const jobId = await jobQueue.send(
      LIBRARY_SYNC_QUEUE,
      { librarySectionId: source.librarySectionId, trigger: 'webhook' },
      { singletonKey: source.librarySectionId, singletonSeconds: 60 },
    )
    request.log.info(
      {
        event: parsed.data.event,
        librarySectionId: source.librarySectionId,
        jobId,
      },
      'Queued Plex webhook refresh',
    )
    return reply.code(204).send()
  })

  app.post('/api/v1/setup/complete', async (request, reply) => {
    const parsed = CompleteSetupRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(
        reply,
        400,
        'INVALID_REQUEST',
        'Review the Plex connection, local owner, and selected music libraries.',
      )
    }

    const encryptionKey = configurationForSetup(config)
    if (!encryptionKey) {
      return sendProblem(
        reply,
        503,
        'MISSING_ENCRYPTION_KEY',
        'Set MUSEARR_ENCRYPTION_KEY before saving a Plex connection.',
      )
    }

    const existing = await getSetupStatus(database)
    if (existing.configured) {
      return sendProblem(
        reply,
        409,
        'INSTANCE_ALREADY_CONFIGURED',
        'This Musearr instance has already been configured.',
      )
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
          initialJobIds = await Promise.all([
            ...(await getLibrarySyncSources(database)).map((source) =>
              readyJobQueue.send(LIBRARY_SYNC_QUEUE, {
                librarySectionId: source.librarySectionId,
                trigger: 'initial-setup',
              }),
            ),
            readyJobQueue.send(PLAYLIST_SYNC_QUEUE, {
              plexServerId: result.server.id,
              trigger: 'initial-setup',
            }),
          ])
        } catch (queueError) {
          app.log.error(queueError, 'Initial Plex sync could not be queued after setup')
        }
      }
      setSession(reply, result.user)
      return reply.code(201).send({
        user: { username: result.user.username, role: result.user.role },
        plexServer: {
          name: result.server.name,
          machineIdentifier: result.server.machineIdentifier,
        },
        initialJobIds,
      })
    } catch (error) {
      if (error instanceof PlexConnectionError) {
        return sendProblem(reply, error.code === 'UNAUTHENTICATED' ? 401 : 422, error.code, error.message)
      }
      if (error instanceof Error && error.message === 'INSTANCE_ALREADY_CONFIGURED') {
        return sendProblem(
          reply,
          409,
          'INSTANCE_ALREADY_CONFIGURED',
          'This Musearr instance has already been configured.',
        )
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

  app.post('/api/v1/auth/logout', async (request, reply) => {
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(request))
    return reply.code(204).send()
  })

  app.get('/api/v1/sync-runs', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view sync activity.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can view sync activity.')
    }
    return reply.send(SyncRunListResponseSchema.parse({ runs: await listSyncRuns(database) }))
  })

  app.get('/api/v1/sync-runs/:id', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view sync activity.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can view sync activity.')
    }
    const id = typeof (request.params as { id?: unknown }).id === 'string' ? (request.params as { id: string }).id : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid sync run.')
    }
    const run = await getSyncRun(database, id)
    if (!run) return sendProblem(reply, 404, 'SYNC_RUN_NOT_FOUND', 'No sync run matched this request.')
    return reply.send(SyncRunResponseSchema.parse({ run }))
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
      {
        singletonKey: `${request.user.sub}:${parsed.data.kind}`,
        singletonSeconds: 30,
      },
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

  app.post('/api/v1/daily-briefs/generate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to generate a daily briefing.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can generate a daily briefing.')
    }
    if (!jobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }

    const jobId = await jobQueue.send(
      DAILY_BRIEF_QUEUE,
      { trigger: 'manual', userId: request.user.sub },
      { singletonKey: request.user.sub, singletonSeconds: 60 },
    )
    return reply.code(202).send({ jobId })
  })

  app.get('/api/v1/daily-briefs/latest', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view your daily briefing.')
    }

    return reply.send(
      DailyBriefResponseSchema.parse({
        brief: await getLatestDailyBrief(database, request.user.sub),
      }),
    )
  })

  app.get('/api/v1/dashboard', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view your music dashboard.')
    }

    const overview = await getDashboardOverview(database, request.user.sub)
    return reply.send(DashboardOverviewSchema.parse(overview))
  })

  app.get('/api/v1/metadata/health', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view library metadata.')
    }
    return reply.send(LibraryHealthSchema.parse(await getLibraryHealth(database)))
  })

  app.get('/api/v1/library/albums', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to browse your albums.')
    }
    const parsed = AlbumListQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid sort.')
    }
    return reply.send(
      AlbumListResponseSchema.parse({
        albums: await listAlbums(database, request.user.sub, {
          sort: parsed.data.sort,
          ...(parsed.data.q ? { search: parsed.data.q } : {}),
        }),
      }),
    )
  })

  app.get('/api/v1/library/genres', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view genres.')
    }
    return reply.send(GenreListResponseSchema.parse({ genres: await listGenres(database) }))
  })

  app.post('/api/v1/playlists/from-filter', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to build a playlist.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can build playlists.')
    }
    const parsed = BuildFromFilterRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Give a genre, a decade, or a description.')
    }
    const readyJobQueue = jobQueue
    if (!readyJobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }

    const { genre, decade, prompt, size } = parsed.data
    const name =
      parsed.data.name?.trim() ||
      (genre ? `${genre}` : decade ? `The ${decade}s` : `“${(prompt ?? '').slice(0, 60)}”`)
    const payload = genre
      ? { filter: { kind: 'genre', genre } }
      : decade
        ? { filter: { kind: 'decade', decade } }
        : { prompt: prompt as string }

    await readyJobQueue.send(PLAYLIST_BUILD_QUEUE, {
      userId: request.user.sub,
      name,
      size,
      ...payload,
      trigger: 'manual',
    })
    return reply.code(202).send(PlaylistBuildAcceptedSchema.parse({ status: 'building' }))
  })

  app.get('/api/v1/library/tracks', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to search your library.')
    }
    const parsed = LibraryTrackSearchQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Enter at least two characters to search.')
    }
    return reply.send(
      LibraryTrackSearchResponseSchema.parse({
        tracks: await searchLibraryTracks(database, parsed.data.q),
      }),
    )
  })

  app.get('/api/v1/insights/listening', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view your listening insights.')
    }

    const parsed = ListeningInsightQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a period between 7 and 90 days.')
    }
    const timezone = await getUserTimezone(database, request.user.sub)
    const insight = await getListeningInsightSummary(database, request.user.sub, timezone, parsed.data.days)
    return reply.send(ListeningInsightSummarySchema.parse(insight))
  })

  app.post('/api/v1/playlists/generate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to generate a playlist.')
    }

    const parsed = GeneratePlaylistRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a seed track and a playlist length.')
    }
    const readyJobQueue = jobQueue
    if (!readyJobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }

    const seedLabel = await getPlaylistSeedLabel(database, parsed.data.seedTrackId)
    if (!seedLabel) {
      return sendProblem(reply, 404, 'SEED_TRACK_NOT_FOUND', 'That track is not in the local library mirror.')
    }

    const generationId = await createPlaylistGeneration(database, {
      userId: request.user.sub,
      seedTrackId: parsed.data.seedTrackId,
      seedLabel,
      name: parsed.data.name?.trim() || `Like ${seedLabel}`,
      algorithmVersion: 'pending',
      targetSize: parsed.data.targetSize,
      acquireMissing: parsed.data.acquireMissing,
      publishToPlex: parsed.data.publishToPlex,
    })
    await readyJobQueue.send(
      PLAYLIST_GENERATION_QUEUE,
      { generationId, trigger: 'manual' },
      { singletonKey: generationId },
    )
    return reply
      .code(202)
      .send(PlaylistGenerationAcceptedSchema.parse({ generationId, status: 'generating' }))
  })

  app.get('/api/v1/playlists/generations', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view your playlists.')
    }
    return reply.send(
      PlaylistGenerationListResponseSchema.parse({
        generations: await listPlaylistGenerations(database, request.user.sub),
      }),
    )
  })

  app.get('/api/v1/playlists/generations/:id', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view your playlists.')
    }
    const id = typeof (request.params as { id?: unknown }).id === 'string' ? (request.params as { id: string }).id : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid playlist.')
    }
    const generation = await getPlaylistGeneration(database, request.user.sub, id)
    if (!generation) {
      return sendProblem(reply, 404, 'PLAYLIST_NOT_FOUND', 'No generated playlist matched this request.')
    }
    return reply.send(PlaylistGenerationResponseSchema.parse({ generation }))
  })

  app.get('/api/v1/playlists', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view your playlists.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can curate playlists.')
    }
    return reply.send(
      MirroredPlaylistListResponseSchema.parse({ playlists: await listCuratablePlaylists(database) }),
    )
  })

  app.get('/api/v1/playlists/ideas', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view playlist ideas.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage playlists.')
    }
    return reply.send(
      PlaylistIdeaListResponseSchema.parse({ ideas: await listPlaylistIdeas(database, request.user.sub) }),
    )
  })

  app.post('/api/v1/playlists/ideas/scan', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to scan for playlist ideas.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage playlists.')
    }
    const readyJobQueue = jobQueue
    if (!readyJobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }
    await readyJobQueue.send(
      PLAYLIST_IDEAS_SCAN_QUEUE,
      { userId: request.user.sub, trigger: 'manual' },
      { singletonKey: request.user.sub, singletonSeconds: 30 },
    )
    return reply.code(202).send(PlaylistIdeaScanAcceptedSchema.parse({ status: 'scanning' }))
  })

  app.post('/api/v1/playlists/ideas/:id/dismiss', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to manage playlist ideas.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage playlists.')
    }
    const id = uuidParam(request.params)
    if (!id) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid playlist idea.')
    }
    const updated = await setPlaylistIdeaStatus(database, request.user.sub, id, 'dismissed')
    if (!updated) {
      return sendProblem(reply, 404, 'IDEA_NOT_FOUND', 'No playlist idea matched this request.')
    }
    return reply.send(
      PlaylistIdeaListResponseSchema.parse({ ideas: await listPlaylistIdeas(database, request.user.sub) }),
    )
  })

  app.post('/api/v1/playlists/ideas/:id/create', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to create a playlist.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage playlists.')
    }
    const id = uuidParam(request.params)
    if (!id) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid playlist idea.')
    }
    const readyJobQueue = jobQueue
    if (!readyJobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }
    const idea = await getPlaylistIdea(database, request.user.sub, id)
    if (!idea) {
      return sendProblem(reply, 404, 'IDEA_NOT_FOUND', 'No playlist idea matched this request.')
    }
    if (idea.status === 'created') {
      return sendProblem(reply, 409, 'IDEA_ALREADY_CREATED', 'This idea has already been made into a playlist.')
    }
    await readyJobQueue.send(
      PLAYLIST_IDEA_CREATE_QUEUE,
      { userId: request.user.sub, ideaId: id, trigger: 'manual' },
      { singletonKey: id },
    )
    return reply.code(202).send(PlaylistIdeaCreateAcceptedSchema.parse({ ideaId: id, status: 'creating' }))
  })

  app.post('/api/v1/playlists/curations', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to curate a playlist.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can curate playlists.')
    }
    const parsed = CreateCurationRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a playlist to curate.')
    }
    const readyJobQueue = jobQueue
    if (!readyJobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }

    const created = await createCurationForRatingKey(database, {
      userId: request.user.sub,
      plexPlaylistRatingKey: parsed.data.plexPlaylistRatingKey,
      algorithmVersion: CURATION_ALGORITHM_VERSION,
      useAi: parsed.data.useAi,
      requestedLimit: parsed.data.limit,
    })
    if (!created) {
      return sendProblem(
        reply,
        404,
        'PLAYLIST_NOT_FOUND',
        'That playlist is not in the local mirror yet. Run a playlist sync and try again.',
      )
    }
    await readyJobQueue.send(
      PLAYLIST_CURATION_QUEUE,
      { curationId: created.curationId, trigger: 'manual' },
      { singletonKey: created.curationId },
    )
    return reply
      .code(202)
      .send(CurationAcceptedSchema.parse({ curationId: created.curationId, status: 'proposed' }))
  })

  app.get('/api/v1/playlists/curations', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view playlist curations.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can curate playlists.')
    }
    return reply.send(
      CurationListResponseSchema.parse({ curations: await listCurations(database, request.user.sub) }),
    )
  })

  app.get('/api/v1/playlists/curations/:id', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view playlist curations.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can curate playlists.')
    }
    const id = uuidParam(request.params)
    if (!id) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid curation.')
    }
    const curation = await getCuration(database, request.user.sub, id)
    if (!curation) {
      return sendProblem(reply, 404, 'CURATION_NOT_FOUND', 'No curation matched this request.')
    }
    return reply.send(CurationResponseSchema.parse({ curation }))
  })

  app.post('/api/v1/playlists/curations/:id/items/:itemId', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to review a curation.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can curate playlists.')
    }
    const params = request.params as { id?: unknown; itemId?: unknown }
    const id = uuidParam({ id: params.id })
    const itemId = uuidParam({ id: params.itemId })
    if (!id || !itemId) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid curation item.')
    }
    const parsed = SetCurationItemDecisionRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose accept, reject, or suggested.')
    }
    const updated = await setCurationItemDecision(
      database,
      request.user.sub,
      id,
      itemId,
      parsed.data.decision,
    )
    if (!updated) {
      return sendProblem(
        reply,
        404,
        'CURATION_ITEM_NOT_FOUND',
        'That curation item is not open for review.',
      )
    }
    const curation = await getCuration(database, request.user.sub, id)
    if (!curation) {
      return sendProblem(reply, 404, 'CURATION_NOT_FOUND', 'No curation matched this request.')
    }
    return reply.send(CurationResponseSchema.parse({ curation }))
  })

  app.post('/api/v1/playlists/curations/:id/apply', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to apply a curation.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can curate playlists.')
    }
    const id = uuidParam(request.params)
    if (!id) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Choose a valid curation.')
    }
    const readyJobQueue = jobQueue
    if (!readyJobQueue) {
      return sendProblem(reply, 503, 'QUEUE_UNAVAILABLE', 'Musearr is still preparing its local job queue.')
    }
    const curation = await getCuration(database, request.user.sub, id)
    if (!curation) {
      return sendProblem(reply, 404, 'CURATION_NOT_FOUND', 'No curation matched this request.')
    }
    if (!['proposed', 'approved', 'failed', 'partially_applied'].includes(curation.status)) {
      return sendProblem(reply, 409, 'CURATION_NOT_APPLICABLE', 'This curation cannot be applied in its current state.')
    }
    if (curation.counts.accepted === 0) {
      return sendProblem(reply, 409, 'CURATION_NOTHING_ACCEPTED', 'Accept at least one track before applying.')
    }
    await readyJobQueue.send(
      PLAYLIST_CURATION_APPLY_QUEUE,
      { curationId: id, trigger: 'manual' },
      { singletonKey: id },
    )
    return reply.code(202).send(CurationAcceptedSchema.parse({ curationId: id, status: 'applying' }))
  })

  app.post('/api/v1/settings/lidarr/test', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to test the Lidarr connection.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage integrations.')
    }

    const parsed = LidarrConnectionRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Enter a Lidarr URL and API key.')
    }

    try {
      const result = await new LidarrClient(parsed.data.baseUrl, parsed.data.apiKey).testConnection()
      return reply.send(LidarrConnectionResultSchema.parse(result))
    } catch (error) {
      if (error instanceof LidarrConnectionError) {
        return sendProblem(reply, error.code === 'UNAUTHENTICATED' ? 401 : 422, error.code, error.message)
      }
      throw error
    }
  })

  app.post('/api/v1/settings/lidarr', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to save the Lidarr connection.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage integrations.')
    }

    const parsed = LidarrConnectionRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Enter a Lidarr URL and API key.')
    }
    const encryptionKey = configurationForSetup(config)
    if (!encryptionKey) {
      return sendProblem(
        reply,
        503,
        'MISSING_ENCRYPTION_KEY',
        'Set MUSEARR_ENCRYPTION_KEY before saving a Lidarr connection.',
      )
    }

    try {
      const result = await new LidarrClient(parsed.data.baseUrl, parsed.data.apiKey).testConnection()
      await upsertLidarrConnection(database, {
        baseUrl: normaliseLidarrBaseUrl(parsed.data.baseUrl),
        apiKeyCiphertext: encryptSecret(parsed.data.apiKey, encryptionKey),
        instanceName: result.instanceName,
        version: result.version,
        rootFolderPath:
          parsed.data.rootFolderPath ?? result.rootFolders[0]?.path ?? null,
        qualityProfileId:
          parsed.data.qualityProfileId ?? result.qualityProfiles[0]?.id ?? null,
        metadataProfileId:
          parsed.data.metadataProfileId ?? result.metadataProfiles[0]?.id ?? null,
      })
      return reply.send(LidarrConnectionStatusSchema.parse(await getLidarrConnectionStatus(database)))
    } catch (error) {
      if (error instanceof LidarrConnectionError) {
        return sendProblem(reply, error.code === 'UNAUTHENTICATED' ? 401 : 422, error.code, error.message)
      }
      throw error
    }
  })

  app.get('/api/v1/settings/lidarr', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view integration settings.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage integrations.')
    }
    return reply.send(LidarrConnectionStatusSchema.parse(await getLidarrConnectionStatus(database)))
  })

  app.get('/api/v1/settings/local-ai', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view integration settings.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage integrations.')
    }
    const override = await getAiSettings(database)
    return reply.send(LocalAiStatusSchema.parse(localAiStatusPayload(config, override)))
  })

  app.put('/api/v1/settings/local-ai', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to change AI settings.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage integrations.')
    }
    const parsed = LocalAiSettingsUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Provide a complete Local AI configuration.')
    }
    const saved = await upsertAiSettings(database, {
      enabled: parsed.data.enabled,
      provider: parsed.data.provider,
      baseUrl: parsed.data.baseUrl,
      model: parsed.data.model,
      keepAliveSeconds: parsed.data.keepAliveSeconds,
      autoStart: parsed.data.autoStart,
    })
    return reply.send(LocalAiStatusSchema.parse(localAiStatusPayload(config, saved)))
  })

  app.delete('/api/v1/settings/local-ai', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to change AI settings.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage integrations.')
    }
    await clearAiSettings(database)
    return reply.send(LocalAiStatusSchema.parse(localAiStatusPayload(config, null)))
  })

  app.post('/api/v1/settings/local-ai/test', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to test the AI connection.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage integrations.')
    }
    const parsed = LocalAiTestRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(reply, 400, 'INVALID_REQUEST', 'Enter an AI provider, endpoint URL, and model.')
    }
    if (parsed.data.provider !== 'ollama') {
      return reply.send(LocalAiTestResultSchema.parse({ reachable: false }))
    }
    // `isReachable()` swallows every failure; the caller only ever learns yes/no,
    // never the response body, status, or error text.
    const reachable = await new OllamaLocalAiProvider({
      baseUrl: parsed.data.baseUrl,
      model: parsed.data.model,
    }).isReachable()
    return reply.send(LocalAiTestResultSchema.parse({ reachable }))
  })

  app.get('/api/v1/settings/musicbrainz', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return sendProblem(reply, 401, 'UNAUTHENTICATED', 'Sign in to view integration settings.')
    }
    if (request.user.role !== 'owner') {
      return sendProblem(reply, 403, 'FORBIDDEN', 'Only the local owner can manage integrations.')
    }
    return reply.send(
      MusicBrainzStatusSchema.parse({
        enabled: config.MUSEARR_MUSICBRAINZ_ENABLED && Boolean(config.MUSEARR_MUSICBRAINZ_CONTACT),
        contactConfigured: Boolean(config.MUSEARR_MUSICBRAINZ_CONTACT),
        musicBrainzBaseUrl: config.MUSEARR_MUSICBRAINZ_BASE_URL ?? null,
        listenBrainzBaseUrl: config.MUSEARR_LISTENBRAINZ_BASE_URL ?? null,
      }),
    )
  })

  if (ownsDatabase) {
    app.addHook('onClose', async () => {
      await jobQueue?.stop?.()
      await database.end({ timeout: 5 })
    })
  }

  return app
}
