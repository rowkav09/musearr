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
    return new OllamaLocalAiProvider({ baseUrl: config.baseUrl, model: config.model })
  }

  return new NullLocalAiProvider()
}
