import { z } from 'zod'

export * from './lidarr.js'
export * from './local-ai.js'
export * from './musicbrainz.js'
export * from './playlists.js'

export const SetupPhaseSchema = z.enum(['unconfigured', 'configured'])

export const SystemStatusSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  version: z.string(),
  database: z.enum(['connected', 'unavailable']),
  checkedAt: z.string().datetime(),
})

export const SetupStatusSchema = z.object({
  phase: SetupPhaseSchema,
  plexServer: z
    .object({
      name: z.string(),
      machineIdentifier: z.string(),
      lastSeenAt: z.string().datetime().nullable(),
    })
    .nullable(),
})

export const PlexConnectionRequestSchema = z.object({
  baseUrl: z.string().trim().url().max(2048),
  token: z.string().trim().min(8).max(4096),
})

export const PlexLibrarySectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.literal('artist'),
})

export const PlexConnectionResultSchema = z.object({
  machineIdentifier: z.string(),
  serverName: z.string(),
  version: z.string().nullable(),
  musicLibraries: z.array(PlexLibrarySectionSchema),
})

export const PlexPinCreateResponseSchema = z.object({
  id: z.number().int().positive(),
  code: z.string().min(1),
  authUrl: z.string().url(),
})

export const PlexAuthorizedServerSchema = z.object({
  name: z.string(),
  machineIdentifier: z.string(),
  baseUrl: z.string().url(),
})

export const PlexPinStatusResponseSchema = z.object({
  authToken: z.string().nullable(),
  servers: z.array(PlexAuthorizedServerSchema),
})

const PlexWebhookSectionIdSchema = z
  .union([z.string().trim().min(1).max(64), z.number().int().nonnegative()])
  .transform(String)

export const PlexWebhookPayloadSchema = z
  .object({
    event: z.string().trim().min(1).max(128),
    Server: z
      .object({
        uuid: z.string().trim().min(1).max(256),
      })
      .passthrough()
      .optional(),
    Metadata: z
      .object({
        librarySectionID: PlexWebhookSectionIdSchema.optional(),
        librarySectionType: z.string().trim().max(64).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const CompleteSetupRequestSchema = PlexConnectionRequestSchema.extend({
  ownerUsername: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, underscores, or hyphens.'),
  ownerPassword: z.string().min(12).max(1024),
  selectedLibraryIds: z.array(z.string().min(1).max(64)).min(1).max(50),
})

export const QueueLibrarySyncRequestSchema = z.object({
  librarySectionId: z.string().uuid().optional(),
})

export const RecommendationKindSchema = z.enum(['daily_mix', 'forgotten_favourites', 'hidden_gems', 'recently_added'])

export const QueueRecommendationRunRequestSchema = z.object({
  kind: RecommendationKindSchema,
  limit: z.number().int().min(1).max(100).default(30),
})

export const RecommendationQuerySchema = z.object({
  kind: RecommendationKindSchema.optional(),
})

const DashboardFavouriteSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  playCount: z.number().nonnegative(),
})

const DashboardRecommendationSchema = z.object({
  runId: z.string().uuid(),
  kind: RecommendationKindSchema,
  algorithmVersion: z.string(),
  createdAt: z.string().datetime(),
  trackId: z.string().uuid(),
  trackTitle: z.string(),
  artistName: z.string(),
  albumTitle: z.string(),
  rank: z.number().int().positive(),
  score: z.number().min(0).max(1),
  reasons: z.array(z.unknown()),
  summary: z.string(),
  summaryPhrasing: z.enum(['deterministic', 'local_ai']),
})

export const LibraryHealthSchema = z.object({
  totals: z.object({
    artists: z.number().int().nonnegative(),
    albums: z.number().int().nonnegative(),
    tracks: z.number().int().nonnegative(),
    playlists: z.number().int().nonnegative(),
    genres: z.number().int().nonnegative(),
  }),
  gaps: z.object({
    tracksMissingYear: z.number().int().nonnegative(),
    tracksMissingGenre: z.number().int().nonnegative(),
    tracksMissingDuration: z.number().int().nonnegative(),
    albumsMissingYear: z.number().int().nonnegative(),
    unresolvedPlaylistItems: z.number().int().nonnegative(),
  }),
  playlistsWithUnresolved: z.array(
    z.object({ name: z.string(), unresolved: z.number().int().nonnegative() }),
  ),
})

export type LibraryHealth = z.infer<typeof LibraryHealthSchema>

export const LibraryTrackSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
})

export const LibraryTrackHitSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  artistName: z.string(),
  albumTitle: z.string(),
})

export const LibraryTrackSearchResponseSchema = z.object({
  tracks: z.array(LibraryTrackHitSchema),
})

export type LibraryTrackHit = z.infer<typeof LibraryTrackHitSchema>
export type LibraryTrackSearchResponse = z.infer<typeof LibraryTrackSearchResponseSchema>

export const AlbumListQuerySchema = z.object({
  sort: z.enum(['plays', 'recent', 'title']).default('plays'),
  q: z.string().trim().max(120).optional(),
})

export const AlbumCardSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  artistName: z.string(),
  year: z.number().int().nullable(),
  trackCount: z.number().int().nonnegative(),
  totalPlays: z.number().int().nonnegative(),
  avgRating: z.number().nullable(),
  addedAt: z.string().datetime().nullable(),
})

export const AlbumListResponseSchema = z.object({ albums: z.array(AlbumCardSchema) })

export const IncompleteAlbumSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  artistName: z.string(),
  haveTracks: z.number().int().nonnegative(),
  expectedTracks: z.number().int().nonnegative(),
})
export const IncompleteAlbumListResponseSchema = z.object({
  albums: z.array(IncompleteAlbumSchema),
})
export const AlbumRequestSchema = z.object({
  artistName: z.string().trim().min(1).max(300),
  albumTitle: z.string().trim().min(1).max(300),
})
export const AlbumRequestAcceptedSchema = z.object({ status: z.literal('requested') })

export type IncompleteAlbum = z.infer<typeof IncompleteAlbumSchema>
export type AlbumRequest = z.infer<typeof AlbumRequestSchema>

export type AlbumCard = z.infer<typeof AlbumCardSchema>
export type AlbumListResponse = z.infer<typeof AlbumListResponseSchema>

export const GenreListResponseSchema = z.object({
  genres: z.array(z.object({ name: z.string(), trackCount: z.number().int().nonnegative() })),
})

export const BuildFromFilterRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    genre: z.string().trim().min(1).max(120).optional(),
    decade: z.number().int().min(1900).max(2100).optional(),
    prompt: z.string().trim().min(3).max(300).optional(),
    size: z.number().int().min(1).max(200).default(30),
  })
  .refine(
    (value) => [value.genre, value.decade, value.prompt].filter((v) => v !== undefined).length === 1,
    { message: 'Provide exactly one of genre, decade, or prompt.' },
  )

export const PlaylistBuildAcceptedSchema = z.object({ status: z.literal('building') })

export type GenreListResponse = z.infer<typeof GenreListResponseSchema>
export type BuildFromFilterRequest = z.infer<typeof BuildFromFilterRequestSchema>

export const DashboardOverviewSchema = z.object({
  library: z.object({
    artistCount: z.number().int().nonnegative(),
    albumCount: z.number().int().nonnegative(),
    trackCount: z.number().int().nonnegative(),
    totalDurationMs: z.number().nonnegative(),
    newestAddedAt: z.string().datetime().nullable(),
  }),
  listening: z.object({
    totalPlayCount: z.number().nonnegative(),
    playedTrackCount: z.number().int().nonnegative(),
    ratedTrackCount: z.number().int().nonnegative(),
    lastPlayedAt: z.string().datetime().nullable(),
  }),
  favourites: z.object({
    artists: z.array(DashboardFavouriteSchema),
    genres: z.array(DashboardFavouriteSchema),
  }),
  sync: z.object({
    status: z.enum(['not_started', 'queued', 'running', 'completed', 'failed', 'cancelled']),
    lastCompletedAt: z.string().datetime().nullable(),
    errorSummary: z.string().nullable(),
  }),
  dailyMix: z.array(DashboardRecommendationSchema),
})

export const DailyBriefCardSchema = z.object({
  kind: z.enum(['daily_mix', 'favourite_artist', 'favourite_genre', 'library', 'sync']),
  title: z.string().min(1).max(280),
  body: z.string().min(1).max(2_000),
})

export const DailyBriefDeliverySchema = z.object({
  status: z.enum(['pending', 'delivered', 'failed']),
  attemptCount: z.number().int().nonnegative(),
  lastAttemptAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  errorSummary: z.string().nullable(),
})

export const DailyBriefSchema = z.object({
  id: z.string().uuid(),
  briefDate: z.string().date(),
  timezone: z.string().min(1),
  algorithmVersion: z.string().min(1),
  content: z.object({
    headline: z.string().min(1).max(280),
    summary: z.string().min(1).max(2_000),
    cards: z.array(DailyBriefCardSchema).min(1).max(4),
  }),
  createdAt: z.string().datetime(),
  discordDelivery: DailyBriefDeliverySchema.nullable(),
})

export const DailyBriefResponseSchema = z.object({
  brief: DailyBriefSchema.nullable(),
})

export const ListeningInsightQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
})

const ListeningCoverageSchema = z.enum(['none', 'exact', 'observed', 'mixed'])

export const ListeningInsightSummarySchema = z.object({
  period: z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    timezone: z.string().min(1),
  }),
  playback: z.object({
    reportedPlays: z.number().int().nonnegative(),
    exactPlays: z.number().int().nonnegative(),
    observedPlays: z.number().int().nonnegative(),
    estimatedListenedMs: z.number().nonnegative(),
    uniqueTracks: z.number().int().nonnegative(),
    uniqueArtists: z.number().int().nonnegative(),
    coverage: ListeningCoverageSchema,
  }),
  topArtists: z.array(DashboardFavouriteSchema),
  allTime: z.object({
    totalPlays: z.number().int().nonnegative(),
    playedTracks: z.number().int().nonnegative(),
    ratedTracks: z.number().int().nonnegative(),
    topArtists: z.array(DashboardFavouriteSchema),
    topTracks: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        artistName: z.string(),
        playCount: z.number().int().nonnegative(),
      }),
    ),
    topGenres: z.array(DashboardFavouriteSchema),
  }),
})

export type SetupPhase = z.infer<typeof SetupPhaseSchema>
export type SystemStatus = z.infer<typeof SystemStatusSchema>
export type SetupStatus = z.infer<typeof SetupStatusSchema>
export type PlexConnectionRequest = z.infer<typeof PlexConnectionRequestSchema>
export type PlexLibrarySection = z.infer<typeof PlexLibrarySectionSchema>
export type PlexConnectionResult = z.infer<typeof PlexConnectionResultSchema>
export type PlexPinCreateResponse = z.infer<typeof PlexPinCreateResponseSchema>
export type PlexAuthorizedServer = z.infer<typeof PlexAuthorizedServerSchema>
export type PlexPinStatusResponse = z.infer<typeof PlexPinStatusResponseSchema>
export type PlexWebhookPayload = z.infer<typeof PlexWebhookPayloadSchema>
export type CompleteSetupRequest = z.infer<typeof CompleteSetupRequestSchema>
export type QueueLibrarySyncRequest = z.infer<typeof QueueLibrarySyncRequestSchema>
export type RecommendationKind = z.infer<typeof RecommendationKindSchema>
export type QueueRecommendationRunRequest = z.infer<typeof QueueRecommendationRunRequestSchema>
export type DashboardOverview = z.infer<typeof DashboardOverviewSchema>
export type DailyBrief = z.infer<typeof DailyBriefSchema>
export type DailyBriefResponse = z.infer<typeof DailyBriefResponseSchema>
export type ListeningInsightSummary = z.infer<typeof ListeningInsightSummarySchema>


export const SyncFailureClassificationSchema = z.enum([
  'configuration',
  'authentication',
  'upstream_unavailable',
  'upstream_response',
  'unknown',
])

export const SyncRunSchema = z.object({
  id: z.string().uuid(),
  librarySectionId: z.string().uuid().nullable(),
  libraryTitle: z.string().nullable(),
  kind: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  counts: z.object({
    importedTracks: z.number().int().nonnegative(),
    skippedTracks: z.number().int().nonnegative(),
  }),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  failure: z
    .object({
      classification: SyncFailureClassificationSchema,
      summary: z.string(),
    })
    .nullable(),
})

export const SyncRunListResponseSchema = z.object({ runs: z.array(SyncRunSchema) })
export const SyncRunResponseSchema = z.object({ run: SyncRunSchema })

export type SyncFailureClassification = z.infer<typeof SyncFailureClassificationSchema>
export type SyncRun = z.infer<typeof SyncRunSchema>
export type SyncRunListResponse = z.infer<typeof SyncRunListResponseSchema>
export type SyncRunResponse = z.infer<typeof SyncRunResponseSchema>
