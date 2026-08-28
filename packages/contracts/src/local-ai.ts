import { z } from 'zod'

/**
 * Local AI is an optional, deterministic-by-default capability. When it is
 * disabled (the default) every ranking and playlist decision is produced by the
 * deterministic pipeline and this status simply reports `enabled: false`.
 * Musearr only ever talks to a model endpoint the owner runs themselves; it
 * never depends on a hosted LLM.
 */
export const LocalAiProviderNameSchema = z.enum(['none', 'ollama'])

/**
 * Mirrors Ollama's `keep_alive`: omitted (`null`) leaves the provider default,
 * `0` unloads the model after each call, `-1` keeps it resident, `N` is seconds.
 */
export const KeepAliveSecondsSchema = z.number().int().gte(-1).lte(86_400).nullable()

export const LocalAiStatusSchema = z.object({
  enabled: z.boolean(),
  provider: LocalAiProviderNameSchema,
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  keepAliveSeconds: KeepAliveSecondsSchema,
  autoStart: z.boolean(),
  /** Where the effective configuration came from. */
  source: z.enum(['environment', 'database']),
  reachable: z.boolean().nullable(),
})

/**
 * A full replacement of the runtime override. Every field is supplied; the
 * server writes them as one singleton row that supersedes the environment.
 */
export const LocalAiSettingsUpdateSchema = z.object({
  enabled: z.boolean(),
  provider: LocalAiProviderNameSchema,
  baseUrl: z.string().trim().url().max(2048).nullable(),
  model: z.string().trim().min(1).max(256).nullable(),
  keepAliveSeconds: KeepAliveSecondsSchema,
  autoStart: z.boolean(),
})

/** Probe a candidate endpoint without persisting it. */
export const LocalAiTestRequestSchema = z.object({
  provider: LocalAiProviderNameSchema,
  baseUrl: z.string().trim().url().max(2048),
  model: z.string().trim().min(1).max(256),
})

export const LocalAiTestResultSchema = z.object({
  reachable: z.boolean(),
})

export type LocalAiProviderName = z.infer<typeof LocalAiProviderNameSchema>
export type LocalAiStatus = z.infer<typeof LocalAiStatusSchema>
export type LocalAiSettingsUpdate = z.infer<typeof LocalAiSettingsUpdateSchema>
export type LocalAiTestRequest = z.infer<typeof LocalAiTestRequestSchema>
export type LocalAiTestResult = z.infer<typeof LocalAiTestResultSchema>
