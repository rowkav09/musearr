import { z } from 'zod'

/**
 * Local AI is an optional, deterministic-by-default capability. When it is
 * disabled (the default) every ranking and playlist decision is produced by the
 * deterministic pipeline and this status simply reports `enabled: false`.
 * Musearr only ever talks to a model endpoint the owner runs themselves; it
 * never depends on a hosted LLM.
 */
export const LocalAiProviderNameSchema = z.enum(['none', 'ollama'])

export const LocalAiStatusSchema = z.object({
  enabled: z.boolean(),
  provider: LocalAiProviderNameSchema,
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  reachable: z.boolean().nullable(),
})

export type LocalAiProviderName = z.infer<typeof LocalAiProviderNameSchema>
export type LocalAiStatus = z.infer<typeof LocalAiStatusSchema>
