import { NullLocalAiProvider, type LocalAiProvider } from './provider.js'
import { OllamaLocalAiProvider } from './ollama.js'

export {
  LocalAiUnavailableError,
  NullLocalAiProvider,
  type LocalAiCompletionRequest,
  type LocalAiProvider,
  type LocalAiProviderName,
} from './provider.js'
export { OllamaLocalAiProvider, type OllamaProviderOptions } from './ollama.js'
export { LocalAiSimilarTrackProvider, parseSuggestions } from './similar.js'

export type LocalAiConfig = {
  enabled: boolean
  provider: 'none' | 'ollama'
  baseUrl?: string | undefined
  model?: string | undefined
  /** Ollama `keep_alive`, in seconds. `null`/omitted leaves the provider default. */
  keepAliveSeconds?: number | null | undefined
}

/**
 * Resolves the configured provider. Anything short of a fully specified,
 * explicitly enabled configuration yields the null provider, keeping the
 * deterministic pipeline in charge.
 */
export function createLocalAiProvider(config: LocalAiConfig): LocalAiProvider {
  if (!config.enabled || config.provider === 'none' || !config.baseUrl || !config.model) {
    return new NullLocalAiProvider()
  }

  if (config.provider === 'ollama') {
    return new OllamaLocalAiProvider({
      baseUrl: config.baseUrl,
      model: config.model,
      ...(config.keepAliveSeconds === undefined || config.keepAliveSeconds === null
        ? {}
        : { keepAliveSeconds: config.keepAliveSeconds }),
    })
  }

  return new NullLocalAiProvider()
}

/**
 * The runtime override (a persisted `ai_settings` row) supersedes the
 * environment wholesale. With no override, the environment values are used
 * as-is. Either way the result is validated by {@link createLocalAiProvider},
 * so an incomplete configuration still degrades to the null provider.
 */
export function resolveLocalAiConfig(
  environment: LocalAiConfig,
  override: LocalAiConfig | null | undefined,
): LocalAiConfig {
  return override ?? environment
}
