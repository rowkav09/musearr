import { getConfig } from '@musearr/config'
import { getAiSettings, type Database } from '@musearr/db'
import {
  createLocalAiProvider,
  resolveLocalAiConfig,
  type LocalAiConfig,
  type LocalAiProvider,
} from '@musearr/intelligence'

/**
 * Builds the Local AI provider a worker job should use: the persisted
 * `ai_settings` override when present, otherwise the `MUSEARR_LOCAL_AI_*`
 * environment values. An incomplete configuration still resolves to the null
 * provider via {@link createLocalAiProvider}. The worker process has already
 * validated the environment at start-up, so re-reading it here is safe.
 */
export async function resolveLocalAiProvider(database: Database): Promise<LocalAiProvider> {
  const config = getConfig()
  const environment: LocalAiConfig = {
    enabled: config.MUSEARR_LOCAL_AI_ENABLED,
    provider: config.MUSEARR_LOCAL_AI_PROVIDER,
    baseUrl: config.MUSEARR_LOCAL_AI_BASE_URL,
    model: config.MUSEARR_LOCAL_AI_MODEL,
    keepAliveSeconds: null,
  }
  const override = await getAiSettings(database)
  return createLocalAiProvider(
    resolveLocalAiConfig(
      environment,
      override
        ? {
            enabled: override.enabled,
            provider: override.provider === 'ollama' ? 'ollama' : 'none',
            baseUrl: override.baseUrl ?? undefined,
            model: override.model ?? undefined,
            keepAliveSeconds: override.keepAliveSeconds,
          }
        : null,
    ),
  )
}
