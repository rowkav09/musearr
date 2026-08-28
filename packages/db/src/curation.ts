import type { Database } from './repository.js'

export type CurationStatus =
  | 'proposed'
  | 'approved'
  | 'applying'
  | 'applied'
  | 'partially_applied'
  | 'failed'
  | 'dismissed'

export type CurationItemDecision = 'suggested' | 'accepted' | 'rejected'

export type CurationTargetPlaylist = {
  playlistId: string
  plexServerId: string
  plexRatingKey: string
  name: string
  managedByMusearr: boolean
}

export type CreateCuration = {
  userId: string
  target: CurationTargetPlaylist
  useAi: boolean
  algorithmVersion: string
  requestedLimit: number
}

export type CurationItemInput = {
  position: number
  trackId: string
  plexRatingKey: string
  artistName: string
  trackTitle: string
  score: number
  reasonCodes: unknown[]
}

export type CurationItemRecord = {
  id: string
  position: number
  trackId: string
  plexRatingKey: string
  artistName: string
  trackTitle: string
  score: number
  reasons: unknown[]
  decision: CurationItemDecision
  appliedAt: string | null
}

export type CurationRecord = {
  id: string
  playlistName: string
  plexPlaylistRatingKey: string
  playlistManagedByMusearr: boolean
  status: CurationStatus
  useAi: boolean
  aiUsed: boolean
  algorithmVersion: string
  requestedLimit: number
  basisTrackCount: number
  counts: { total: number; accepted: number; rejected: number; suggested: number; applied: number }
  errorSummary: string | null
  createdAt: string
  updatedAt: string
  appliedAt: string | null
  items: CurationItemRecord[]
}

export type CurationSummaryRecord = Omit<CurationRecord, 'items'>

export type CurationJobContext = {
  id: string
  userId: string
  playlistId: string | null
  plexPlaylistRatingKey: string
  playlistName: string
  useAi: boolean
  requestedLimit: number
  status: CurationStatus
}

/** Resolves a mirrored playlist by its Plex rating key. */
export async function getPlaylistByRatingKey(
  database: Database,
  plexRatingKey: string,
): Promise<CurationTargetPlaylist | null> {
  const rows = await database<
    Array<{
      id: string
      plex_server_id: string
      plex_rating_key: string
      name: string
      managed_by_musearr: boolean
    }>
  >`
    SELECT id, plex_server_id, plex_rating_key, name, managed_by_musearr
    FROM playlists
    WHERE plex_rating_key = ${plexRatingKey}
    ORDER BY last_synced_at DESC NULLS LAST
    LIMIT 1
  `
  const row = rows[0]
  if (!row) {
    return null
  }
  return {
    playlistId: row.id,
    plexServerId: row.plex_server_id,
    plexRatingKey: row.plex_rating_key,
    name: row.name,
    managedByMusearr: row.managed_by_musearr,
  }
}

export type CuratablePlaylist = {
  plexRatingKey: string
  name: string
  managedByMusearr: boolean
  trackCount: number
}

/** Mirrored playlists the owner could curate, most recently synced first. */
export async function listCuratablePlaylists(database: Database): Promise<CuratablePlaylist[]> {
  const rows = await database<
    Array<{ plex_rating_key: string; name: string; managed_by_musearr: boolean; track_count: string }>
  >`
    SELECT p.plex_rating_key, p.name, p.managed_by_musearr,
           COUNT(item.track_id)::text AS track_count
    FROM playlists p
    LEFT JOIN playlist_items item ON item.playlist_id = p.id AND item.track_id IS NOT NULL
    GROUP BY p.id, p.plex_rating_key, p.name, p.managed_by_musearr, p.last_synced_at
    ORDER BY p.last_synced_at DESC NULLS LAST, p.name ASC
  `
  return rows.map((row) => ({
    plexRatingKey: row.plex_rating_key,
    name: row.name,
    managedByMusearr: row.managed_by_musearr,
    trackCount: Number(row.track_count) || 0,
  }))
}

/** Track ids currently mirrored on a playlist. Unresolved items are skipped. */
export async function getPlaylistTrackIds(database: Database, playlistId: string): Promise<string[]> {
  const rows = await database<Array<{ track_id: string }>>`
    SELECT track_id FROM playlist_items
    WHERE playlist_id = ${playlistId} AND track_id IS NOT NULL
  `
  return rows.map((row) => row.track_id)
}

/**
 * Resolves the target playlist from its Plex rating key and creates a `proposed`
 * curation row for it. Returns null when the playlist is not in the local mirror.
 */
export async function createCurationForRatingKey(
  database: Database,
  input: {
    userId: string
    plexPlaylistRatingKey: string
    algorithmVersion: string
    useAi: boolean
    requestedLimit: number
  },
): Promise<{ curationId: string; target: CurationTargetPlaylist } | null> {
  const target = await getPlaylistByRatingKey(database, input.plexPlaylistRatingKey)
  if (!target) {
    return null
  }
  const curationId = await createCuration(database, {
    userId: input.userId,
    target,
    useAi: input.useAi,
    algorithmVersion: input.algorithmVersion,
    requestedLimit: input.requestedLimit,
  })
  return { curationId, target }
}

export async function createCuration(database: Database, input: CreateCuration): Promise<string> {
  const rows = await database<Array<{ id: string }>>`
    INSERT INTO playlist_curations (
      user_id, playlist_id, plex_server_id, plex_playlist_rating_key, playlist_name,
      playlist_managed_by_musearr, status, use_ai, algorithm_version, requested_limit
    ) VALUES (
      ${input.userId},
      ${input.target.playlistId},
      ${input.target.plexServerId},
      ${input.target.plexRatingKey},
      ${input.target.name},
      ${input.target.managedByMusearr},
      'proposed',
      ${input.useAi},
      ${input.algorithmVersion},
      ${input.requestedLimit}
    )
    RETURNING id
  `
  const curation = rows[0]
  if (!curation) {
    throw new Error('Failed to create the curation.')
  }
  return curation.id
}

export async function replaceCurationItems(
  database: Database,
  curationId: string,
  items: CurationItemInput[],
  patch: { aiUsed: boolean; basisTrackCount: number; algorithmVersion: string },
): Promise<void> {
  await database.begin(async (transaction) => {
    await transaction`DELETE FROM playlist_curation_items WHERE curation_id = ${curationId}`
    for (const item of items) {
      await transaction`
        INSERT INTO playlist_curation_items (
          curation_id, position, track_id, plex_rating_key, artist_name, track_title,
          score, reason_codes, decision
        ) VALUES (
          ${curationId},
          ${item.position},
          ${item.trackId},
          ${item.plexRatingKey},
          ${item.artistName},
          ${item.trackTitle},
          ${item.score},
          ${transaction.json(item.reasonCodes as Parameters<typeof transaction.json>[0])},
          'suggested'
        )
      `
    }
    await transaction`
      UPDATE playlist_curations
      SET ai_used = ${patch.aiUsed},
          basis_track_count = ${patch.basisTrackCount},
          algorithm_version = ${patch.algorithmVersion},
          status = 'proposed',
          error_summary = NULL,
          updated_at = NOW()
      WHERE id = ${curationId}
    `
  })
}

export async function setCurationStatus(
  database: Database,
  curationId: string,
  status: CurationStatus,
  errorSummary?: string,
): Promise<void> {
  const stampApplied = status === 'applied' || status === 'partially_applied'
  await database`
    UPDATE playlist_curations
    SET status = ${status},
        error_summary = ${errorSummary ? errorSummary.slice(0, 1_000) : null},
        applied_at = CASE WHEN ${stampApplied} THEN COALESCE(applied_at, NOW()) ELSE applied_at END,
        updated_at = NOW()
    WHERE id = ${curationId}
  `
}

export async function getCurationJobContext(
  database: Database,
  curationId: string,
): Promise<CurationJobContext | null> {
  const rows = await database<
    Array<{
      id: string
      user_id: string
      playlist_id: string | null
      plex_playlist_rating_key: string
      playlist_name: string
      use_ai: boolean
      requested_limit: number
      status: CurationStatus
    }>
  >`
    SELECT id, user_id, playlist_id, plex_playlist_rating_key, playlist_name,
           use_ai, requested_limit, status
    FROM playlist_curations
    WHERE id = ${curationId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) {
    return null
  }
  return {
    id: row.id,
    userId: row.user_id,
    playlistId: row.playlist_id,
    plexPlaylistRatingKey: row.plex_playlist_rating_key,
    playlistName: row.playlist_name,
    useAi: row.use_ai,
    requestedLimit: row.requested_limit,
    status: row.status,
  }
}

export async function setCurationItemDecision(
  database: Database,
  userId: string,
  curationId: string,
  itemId: string,
  decision: Exclude<CurationItemDecision, 'suggested'> | 'suggested',
): Promise<boolean> {
  const rows = await database<Array<{ id: string }>>`
    UPDATE playlist_curation_items AS item
    SET decision = ${decision}, updated_at = NOW()
    FROM playlist_curations AS curation
    WHERE item.id = ${itemId}
      AND item.curation_id = ${curationId}
      AND curation.id = item.curation_id
      AND curation.user_id = ${userId}
      AND curation.status IN ('proposed', 'approved')
    RETURNING item.id
  `
  return rows.length > 0
}

export async function getAcceptedCurationItems(
  database: Database,
  curationId: string,
): Promise<Array<{ id: string; plexRatingKey: string; position: number }>> {
  const rows = await database<Array<{ id: string; plex_rating_key: string; position: number }>>`
    SELECT id, plex_rating_key, position
    FROM playlist_curation_items
    WHERE curation_id = ${curationId} AND decision = 'accepted' AND applied_at IS NULL
    ORDER BY position ASC
  `
  return rows.map((row) => ({ id: row.id, plexRatingKey: row.plex_rating_key, position: row.position }))
}

export async function markCurationItemsApplied(
  database: Database,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) {
    return
  }
  await database`
    UPDATE playlist_curation_items
    SET applied_at = NOW(), updated_at = NOW()
    WHERE id::text IN ${database(itemIds)}
  `
}

export async function getCuration(
  database: Database,
  userId: string,
  curationId: string,
): Promise<CurationRecord | null> {
  const rows = await database<Array<CurationRow>>`
    SELECT id, playlist_name, plex_playlist_rating_key, playlist_managed_by_musearr, status,
           use_ai, ai_used, algorithm_version, requested_limit, basis_track_count, error_summary,
           created_at, updated_at, applied_at
    FROM playlist_curations
    WHERE id = ${curationId} AND user_id = ${userId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) {
    return null
  }
  const itemRows = await database<Array<CurationItemRow>>`
    SELECT id, position, track_id, plex_rating_key, artist_name, track_title, score, reason_codes,
           decision, applied_at
    FROM playlist_curation_items
    WHERE curation_id = ${curationId}
    ORDER BY position ASC
  `
  const items = itemRows.map(toItemRecord)
  return { ...toSummary(row, items), items }
}

export async function listCurations(
  database: Database,
  userId: string,
  limit = 30,
): Promise<CurationSummaryRecord[]> {
  const rows = await database<Array<CurationRow & { item_json: unknown }>>`
    SELECT c.id, c.playlist_name, c.plex_playlist_rating_key, c.playlist_managed_by_musearr, c.status,
           c.use_ai, c.ai_used, c.algorithm_version, c.requested_limit, c.basis_track_count,
           c.error_summary, c.created_at, c.updated_at, c.applied_at,
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object('decision', i.decision, 'applied', i.applied_at IS NOT NULL))
              FROM playlist_curation_items i WHERE i.curation_id = c.id),
             '[]'::jsonb
           ) AS item_json
    FROM playlist_curations c
    WHERE c.user_id = ${userId}
    ORDER BY c.created_at DESC
    LIMIT ${Math.min(100, Math.max(1, limit))}
  `
  return rows.map((row) => toSummary(row, parseItemJson(row.item_json)))
}

type CurationRow = {
  id: string
  playlist_name: string
  plex_playlist_rating_key: string
  playlist_managed_by_musearr: boolean
  status: CurationStatus
  use_ai: boolean
  ai_used: boolean
  algorithm_version: string
  requested_limit: number
  basis_track_count: number
  error_summary: string | null
  created_at: Date | string
  updated_at: Date | string
  applied_at: Date | string | null
}

type CurationItemRow = {
  id: string
  position: number
  track_id: string
  plex_rating_key: string
  artist_name: string
  track_title: string
  score: string | number
  reason_codes: unknown
  decision: CurationItemDecision
  applied_at: Date | string | null
}

type Countable = { decision: CurationItemDecision; appliedAt: string | null }

function toItemRecord(row: CurationItemRow): CurationItemRecord {
  return {
    id: row.id,
    position: row.position,
    trackId: row.track_id,
    plexRatingKey: row.plex_rating_key,
    artistName: row.artist_name,
    trackTitle: row.track_title,
    score: clampScore(Number(row.score)),
    reasons: Array.isArray(row.reason_codes) ? (row.reason_codes as unknown[]) : [],
    decision: row.decision,
    appliedAt: serialiseTimestamp(row.applied_at),
  }
}

function toSummary(row: CurationRow, items: Countable[]): CurationSummaryRecord {
  const counts = {
    total: items.length,
    accepted: items.filter((item) => item.decision === 'accepted').length,
    rejected: items.filter((item) => item.decision === 'rejected').length,
    suggested: items.filter((item) => item.decision === 'suggested').length,
    applied: items.filter((item) => item.appliedAt !== null).length,
  }
  return {
    id: row.id,
    playlistName: row.playlist_name,
    plexPlaylistRatingKey: row.plex_playlist_rating_key,
    playlistManagedByMusearr: row.playlist_managed_by_musearr,
    status: row.status,
    useAi: row.use_ai,
    aiUsed: row.ai_used,
    algorithmVersion: row.algorithm_version,
    requestedLimit: row.requested_limit,
    basisTrackCount: row.basis_track_count,
    counts,
    errorSummary: row.error_summary,
    createdAt: serialiseTimestamp(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: serialiseTimestamp(row.updated_at) ?? new Date(0).toISOString(),
    appliedAt: serialiseTimestamp(row.applied_at),
  }
}

function parseItemJson(value: unknown): Countable[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((entry) => {
    const record = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    return {
      decision: (record.decision as CurationItemDecision) ?? 'suggested',
      appliedAt: record.applied === true ? new Date(0).toISOString() : null,
    }
  })
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

function serialiseTimestamp(value: Date | string | null): string | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString()
}
