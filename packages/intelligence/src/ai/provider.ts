/**
 * Local AI foundation.
 *
 * Musearr's ranking and playlist logic is deterministic by default. This module
 * defines a narrow provider interface for an *optional* model that the owner
 * runs on their own hardware. Nothing here reaches a hosted service, and the
 * default {@link NullLocalAiProvider} makes every call a no-op that reports the
 * feature as disabled.
 */

export type LocalAiProviderName = 'none' | 'ollama'

export type LocalAiCompletionRequest = {
  system?: string
  prompt: string
  maxTokens?: number
  temperature?: number
}

export interface LocalAiProvider {
  readonly name: LocalAiProviderName
  readonly enabled: boolean
  readonly model: string | null
  readonly baseUrl: string | null
  /** Cheap liveness probe; never throws. */
  isReachable(): Promise<boolean>
  /** Text completion. Throws {@link LocalAiUnavailableError} when disabled. */
  complete(request: LocalAiCompletionRequest): Promise<string>
  /** Embedding vectors, one per input string. Throws when disabled. */
  embed(texts: string[]): Promise<number[][]>
}

export class LocalAiUnavailableError extends Error {
  constructor(message = 'Local AI is not enabled on this instance.') {
    super(message)
    this.name = 'LocalAiUnavailableError'
  }
}

export class NullLocalAiProvider implements LocalAiProvider {
  readonly name = 'none' as const
  readonly enabled = false
  readonly model = null
  readonly baseUrl = null

  async isReachable(): Promise<boolean> {
    return false
  }

  async complete(_request: LocalAiCompletionRequest): Promise<string> {
    throw new LocalAiUnavailableError()
  }

  async embed(_texts: string[]): Promise<number[][]> {
    throw new LocalAiUnavailableError()
  }
}
