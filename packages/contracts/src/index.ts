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
