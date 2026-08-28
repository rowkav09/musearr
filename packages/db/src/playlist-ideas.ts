import type { Database } from './repository.js'

export type PlaylistIdeaStatus = 'proposed' | 'dismissed' | 'created'

export type PlaylistIdeaInput = {
  name: string
  rationale: string
  kind: string
  filter: unknown
  libraryTrackCount: number
  coveredTrackCount: number
  coverageRatio: number
  score: number
  source: 'deterministic' | 'local_ai'
}

export type PlaylistIdeaRecord = {
  id: string
  name: string
  rationale: string
  kind: string
  filter: unknown
  libraryTrackCount: number
  coveredTrackCount: number
  coverageRatio: number
  score: number
  source: string
  status: PlaylistIdeaStatus
  generationId: string | null
  createdAt: string
}

/** Every track id that sits on at least one mirrored playlist. */
export async function getAllPlaylistedTrackIds(database: Database): Promise<string[]> {
  const rows = await database<Array<{ track_id: string }>>`
    SELECT DISTINCT track_id FROM playlist_items WHERE track_id IS NOT NULL
  `
  return rows.map((row) => row.track_id)
}

/** Replaces the user's still-open ideas; dismissed and materialised ones are kept. */
export async function replacePlaylistIdeas(
  database: Database,
  userId: string,
  ideas: PlaylistIdeaInput[],
  algorithmVersion: string,
): Promise<void> {
  await database.begin(async (transaction) => {
    await transaction`DELETE FROM playlist_ideas WHERE user_id = ${userId} AND status = 'proposed'`
    for (const idea of ideas) {
      await transaction`
        INSERT INTO playlist_ideas (
          user_id, name, rationale, kind, filter, library_track_count, covered_track_count,
          coverage_ratio, score, source, algorithm_version, status
        ) VALUES (
          ${userId},
          ${idea.name},
          ${idea.rationale},
          ${idea.kind},
          ${transaction.json(idea.filter as Parameters<typeof transaction.json>[0])},
          ${idea.libraryTrackCount},
          ${idea.coveredTrackCount},
          ${idea.coverageRatio},
          ${idea.score},
          ${idea.source},
          ${algorithmVersion},
          'proposed'
        )
      `
    }
  })
}

export async function listPlaylistIdeas(
  database: Database,
  userId: string,
): Promise<PlaylistIdeaRecord[]> {
  const rows = await database<Array<PlaylistIdeaRow>>`
    SELECT id, name, rationale, kind, filter, library_track_count, covered_track_count,
           coverage_ratio, score, source, status, generation_id, created_at
    FROM playlist_ideas
    WHERE user_id = ${userId} AND status <> 'dismissed'
    ORDER BY (status = 'proposed') DESC, score DESC, created_at DESC
    LIMIT 50
  `
  return rows.map(toRecord)
}

export async function getPlaylistIdea(
  database: Database,
  userId: string,
  ideaId: string,
): Promise<PlaylistIdeaRecord | null> {
  const rows = await database<Array<PlaylistIdeaRow>>`
    SELECT id, name, rationale, kind, filter, library_track_count, covered_track_count,
           coverage_ratio, score, source, status, generation_id, created_at
    FROM playlist_ideas
    WHERE id = ${ideaId} AND user_id = ${userId}
    LIMIT 1
  `
  const row = rows[0]
  return row ? toRecord(row) : null
}

export async function setPlaylistIdeaStatus(
  database: Database,
  userId: string,
  ideaId: string,
  status: PlaylistIdeaStatus,
  generationId?: string,
): Promise<boolean> {
  const rows = await database<Array<{ id: string }>>`
    UPDATE playlist_ideas
    SET status = ${status},
        generation_id = COALESCE(${generationId ?? null}, generation_id),
        updated_at = NOW()
    WHERE id = ${ideaId} AND user_id = ${userId}
    RETURNING id
  `
  return rows.length > 0
}

type PlaylistIdeaRow = {
  id: string
  name: string
  rationale: string
  kind: string
  filter: unknown
  library_track_count: number
  covered_track_count: number
  coverage_ratio: string | number
  score: string | number
  source: string
  status: PlaylistIdeaStatus
  generation_id: string | null
  created_at: Date | string
}

function toRecord(row: PlaylistIdeaRow): PlaylistIdeaRecord {
  return {
    id: row.id,
    name: row.name,
    rationale: row.rationale,
    kind: row.kind,
    filter: coerceJson(row.filter),
    libraryTrackCount: row.library_track_count,
    coveredTrackCount: row.covered_track_count,
    coverageRatio: Number(row.coverage_ratio),
    score: Number(row.score),
    source: row.source,
    status: row.status,
    generationId: row.generation_id,
    createdAt: serialiseTimestamp(row.created_at) ?? new Date(0).toISOString(),
  }
}

function coerceJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function serialiseTimestamp(value: Date | string | null): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString()
}
