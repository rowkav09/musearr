import { z } from 'zod'

/**
 * A generated playlist is an eventually-consistent object. Items that already
 * exist in the Plex mirror are immediately publishable; items that have to be
 * acquired through Lidarr move through an acquisition state machine and become
 * publishable only after a later `library.sync` mirrors the imported track and
 * gives Musearr a Plex `ratingKey` for it.
 *
 *   in_library ─┐
 *   pending → requested → downloading → imported → matched ─┼─→ (publishable)
 *                                                unavailable ┘  (skipped, generation stays open)
 */
export const PlaylistGenerationItemStateSchema = z.enum([
  'in_library',
  'pending',
  'requested',
  'downloading',
  'imported',
  'matched',
  'unavailable',
])

export const PlaylistGenerationStatusSchema = z.enum([
  'generating',
  'awaiting_acquisition',
  'ready',
  'publishing',
  'published',
  'partially_published',
  'failed',
])

export const GeneratePlaylistRequestSchema = z.object({
  seedTrackId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  /** A target, not a quota: the planner returns up to this many that genuinely fit. */
  targetSize: z.number().int().min(1).max(200).default(25),
  /** Ask Lidarr to acquire suggestions that are not already in the library. */
  acquireMissing: z.boolean().default(false),
  /** Publish the finished playlist back to Plex as a Musearr-managed playlist. */
  publishToPlex: z.boolean().default(false),
})

export const PlaylistGenerationReasonSchema = z.object({
  code: z.string(),
  weight: z.number(),
  facts: z.record(z.string(), z.union([z.string(), z.number()])),
})

export const PlaylistGenerationItemSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int().nonnegative(),
  trackId: z.string().uuid().nullable(),
  trackTitle: z.string(),
  artistName: z.string(),
  albumTitle: z.string().nullable(),
  state: PlaylistGenerationItemStateSchema,
  inLibrary: z.boolean(),
  score: z.number().min(0).max(1),
  reasons: z.array(PlaylistGenerationReasonSchema),
})

export const PlaylistGenerationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  seedTrackId: z.string().uuid().nullable(),
  seedLabel: z.string(),
  status: PlaylistGenerationStatusSchema,
  algorithmVersion: z.string(),
  targetSize: z.number().int().positive(),
  acquireMissing: z.boolean(),
  publishToPlex: z.boolean(),
  counts: z.object({
    total: z.number().int().nonnegative(),
    inLibrary: z.number().int().nonnegative(),
    awaitingAcquisition: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
  }),
  plexPlaylistRatingKey: z.string().nullable(),
  errorSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  items: z.array(PlaylistGenerationItemSchema),
})

export const PlaylistGenerationSummarySchema = PlaylistGenerationSchema.omit({ items: true })

export const PlaylistGenerationResponseSchema = z.object({ generation: PlaylistGenerationSchema })
export const PlaylistGenerationListResponseSchema = z.object({
  generations: z.array(PlaylistGenerationSummarySchema),
})
export const PlaylistGenerationAcceptedSchema = z.object({
  generationId: z.string().uuid(),
  status: PlaylistGenerationStatusSchema,
})

export type PlaylistGenerationItemState = z.infer<typeof PlaylistGenerationItemStateSchema>
export type PlaylistGenerationStatus = z.infer<typeof PlaylistGenerationStatusSchema>
export type GeneratePlaylistRequest = z.infer<typeof GeneratePlaylistRequestSchema>
export type PlaylistGenerationItem = z.infer<typeof PlaylistGenerationItemSchema>
export type PlaylistGeneration = z.infer<typeof PlaylistGenerationSchema>
export type PlaylistGenerationSummary = z.infer<typeof PlaylistGenerationSummarySchema>
export type PlaylistGenerationResponse = z.infer<typeof PlaylistGenerationResponseSchema>
export type PlaylistGenerationListResponse = z.infer<typeof PlaylistGenerationListResponseSchema>
export type PlaylistGenerationAccepted = z.infer<typeof PlaylistGenerationAcceptedSchema>

/**
 * A playlist curation is a review-gated proposal to ADD library tracks to an
 * existing playlist. It never removes or reorders. Each item starts `suggested`;
 * the owner marks items `accepted` or `rejected`, then applies the accepted set
 * to Plex.
 */
export const PlaylistCurationStatusSchema = z.enum([
  'proposed',
  'approved',
  'applying',
  'applied',
  'partially_applied',
  'failed',
  'dismissed',
])

export const CurationItemDecisionSchema = z.enum(['suggested', 'accepted', 'rejected'])

export const CreateCurationRequestSchema = z.object({
  plexPlaylistRatingKey: z.string().trim().min(1).max(128),
  useAi: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
})

export const SetCurationItemDecisionRequestSchema = z.object({
  decision: CurationItemDecisionSchema,
})

export const CurationItemSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int().nonnegative(),
  trackId: z.string().uuid(),
  plexRatingKey: z.string(),
  artistName: z.string(),
  trackTitle: z.string(),
  score: z.number().min(0).max(1),
  reasons: z.array(PlaylistGenerationReasonSchema),
  decision: CurationItemDecisionSchema,
  appliedAt: z.string().datetime().nullable(),
})

export const CurationCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  suggested: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
})

export const CurationSchema = z.object({
  id: z.string().uuid(),
  playlistName: z.string(),
  plexPlaylistRatingKey: z.string(),
  playlistManagedByMusearr: z.boolean(),
  status: PlaylistCurationStatusSchema,
  useAi: z.boolean(),
  aiUsed: z.boolean(),
  algorithmVersion: z.string(),
  requestedLimit: z.number().int().positive(),
  basisTrackCount: z.number().int().nonnegative(),
  counts: CurationCountsSchema,
  errorSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  appliedAt: z.string().datetime().nullable(),
  items: z.array(CurationItemSchema),
})

export const CurationSummarySchema = CurationSchema.omit({ items: true })

export const CurationResponseSchema = z.object({ curation: CurationSchema })
export const CurationListResponseSchema = z.object({ curations: z.array(CurationSummarySchema) })
export const CurationAcceptedSchema = z.object({
  curationId: z.string().uuid(),
  status: PlaylistCurationStatusSchema,
})

export type PlaylistCurationStatus = z.infer<typeof PlaylistCurationStatusSchema>
export type CurationItemDecision = z.infer<typeof CurationItemDecisionSchema>
export type CreateCurationRequest = z.infer<typeof CreateCurationRequestSchema>
export type SetCurationItemDecisionRequest = z.infer<typeof SetCurationItemDecisionRequestSchema>
export type CurationItem = z.infer<typeof CurationItemSchema>
export type Curation = z.infer<typeof CurationSchema>
export type CurationSummary = z.infer<typeof CurationSummarySchema>
export type CurationResponse = z.infer<typeof CurationResponseSchema>
export type CurationListResponse = z.infer<typeof CurationListResponseSchema>
export type CurationAccepted = z.infer<typeof CurationAcceptedSchema>

export const MirroredPlaylistSchema = z.object({
  plexRatingKey: z.string(),
  name: z.string(),
  managedByMusearr: z.boolean(),
  trackCount: z.number().int().nonnegative(),
})

export const MirroredPlaylistListResponseSchema = z.object({
  playlists: z.array(MirroredPlaylistSchema),
})

export type MirroredPlaylist = z.infer<typeof MirroredPlaylistSchema>
export type MirroredPlaylistListResponse = z.infer<typeof MirroredPlaylistListResponseSchema>

/**
 * A playlist idea is a proposed NEW playlist derived from a library-coverage
 * scan: a coherent group of tracks (a genre, a decade, an artist's catalogue,
 * your unplaylisted favourites) that is under-represented on your playlists.
 */
export const PlaylistIdeaStatusSchema = z.enum(['proposed', 'dismissed', 'created'])

export const PlaylistIdeaSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  rationale: z.string(),
  kind: z.string(),
  filter: z.unknown(),
  libraryTrackCount: z.number().int().nonnegative(),
  coveredTrackCount: z.number().int().nonnegative(),
  coverageRatio: z.number().min(0).max(1),
  score: z.number(),
  source: z.string(),
  status: PlaylistIdeaStatusSchema,
  generationId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
})

export const PlaylistIdeaListResponseSchema = z.object({ ideas: z.array(PlaylistIdeaSchema) })
export const PlaylistIdeaScanAcceptedSchema = z.object({ status: z.literal('scanning') })
export const PlaylistIdeaCreateAcceptedSchema = z.object({
  ideaId: z.string().uuid(),
  status: z.literal('creating'),
})

export type PlaylistIdeaStatus = z.infer<typeof PlaylistIdeaStatusSchema>
export type PlaylistIdea = z.infer<typeof PlaylistIdeaSchema>
export type PlaylistIdeaListResponse = z.infer<typeof PlaylistIdeaListResponseSchema>
