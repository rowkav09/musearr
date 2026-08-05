import { z } from 'zod'

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

export const RecommendationKindSchema = z.enum([
  'daily_mix',
  'forgotten_favourites',
  'hidden_gems',
  'recently_added',
])

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
})

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

export type SetupPhase = z.infer<typeof SetupPhaseSchema>
export type SystemStatus = z.infer<typeof SystemStatusSchema>
export type SetupStatus = z.infer<typeof SetupStatusSchema>
export type PlexConnectionRequest = z.infer<typeof PlexConnectionRequestSchema>
export type PlexLibrarySection = z.infer<typeof PlexLibrarySectionSchema>
export type PlexConnectionResult = z.infer<typeof PlexConnectionResultSchema>
export type PlexWebhookPayload = z.infer<typeof PlexWebhookPayloadSchema>
export type CompleteSetupRequest = z.infer<typeof CompleteSetupRequestSchema>
export type QueueLibrarySyncRequest = z.infer<typeof QueueLibrarySyncRequestSchema>
export type RecommendationKind = z.infer<typeof RecommendationKindSchema>
export type QueueRecommendationRunRequest = z.infer<typeof QueueRecommendationRunRequestSchema>
export type DashboardOverview = z.infer<typeof DashboardOverviewSchema>
export type DailyBrief = z.infer<typeof DailyBriefSchema>
export type DailyBriefResponse = z.infer<typeof DailyBriefResponseSchema>
