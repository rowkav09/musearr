import type { Database } from './repository.js'

/**
 * Runtime override for the optional Local AI capability. Environment variables
 * (`MUSEARR_LOCAL_AI_*`) are the default; a row in `ai_settings` (a singleton)
 * replaces them wholesale. Absence of a row means "use the environment".
 *
 * `keepAliveSeconds` mirrors Ollama's `keep_alive`: `null` = provider default,
 * `0` = unload the model after each call, `-1` = keep it resident, `N` = seconds.
 */
export type AiSettingsRecord = {
  enabled: boolean
  provider: string
  baseUrl: string | null
  model: string | null
  keepAliveSeconds: number | null
  autoStart: boolean
  updatedAt: string | null
}

export type UpsertAiSettings = {
  enabled: boolean
  provider: string
  baseUrl: string | null
  model: string | null
  keepAliveSeconds: number | null
  autoStart: boolean
}

type AiSettingsRow = {
  enabled: boolean
  provider: string
  base_url: string | null
  model: string | null
  keep_alive_seconds: number | null
  auto_start: boolean
  updated_at: Date | string | null
}

function toRecord(row: AiSettingsRow): AiSettingsRecord {
  return {
    enabled: row.enabled,
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    keepAliveSeconds: row.keep_alive_seconds,
    autoStart: row.auto_start,
    updatedAt: serialiseTimestamp(row.updated_at),
  }
}

export async function getAiSettings(database: Database): Promise<AiSettingsRecord | null> {
  const rows = await database<AiSettingsRow[]>`
    SELECT enabled, provider, base_url, model, keep_alive_seconds, auto_start, updated_at
    FROM ai_settings
    LIMIT 1
  `
  const row = rows[0]
  return row ? toRecord(row) : null
}

/**
 * Replaces the singleton row. Mirrors {@link upsertLidarrConnection}: delete then
 * insert inside one transaction so the unique `ai_settings_singleton` index can
 * never be violated and a partial write can never be observed.
 */
export async function upsertAiSettings(
  database: Database,
  input: UpsertAiSettings,
): Promise<AiSettingsRecord> {
  return database.begin(async (transaction) => {
    await transaction`DELETE FROM ai_settings`
    const rows = await transaction<AiSettingsRow[]>`
      INSERT INTO ai_settings (
        enabled, provider, base_url, model, keep_alive_seconds, auto_start, updated_at
      ) VALUES (
        ${input.enabled},
        ${input.provider},
        ${input.baseUrl},
        ${input.model},
        ${input.keepAliveSeconds},
        ${input.autoStart},
        NOW()
      )
      RETURNING enabled, provider, base_url, model, keep_alive_seconds, auto_start, updated_at
    `
    const row = rows[0]
    if (!row) {
      throw new Error('Failed to save AI settings.')
    }
    return toRecord(row)
  })
}

/** Removes the override, reverting Local AI resolution to the environment. */
export async function clearAiSettings(database: Database): Promise<void> {
  await database`DELETE FROM ai_settings`
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
