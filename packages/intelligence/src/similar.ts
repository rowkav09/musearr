import type { ExternalTrackSuggestion } from './playlist.js'

export type SimilarSeed = {
  artistName: string
  trackTitle: string
  albumTitle: string | null
  genres: string[]
}

/**
 * Source of "tracks like this seed that may not be in the library yet". The
 * deterministic pipeline uses {@link NullSimilarTrackProvider}, which returns
 * nothing, so a generation is library-only unless an optional provider (for
 * example a local-AI model the owner runs) is wired in.
 */
export interface SimilarTrackProvider {
  readonly name: string
  findSimilar(seed: SimilarSeed, limit: number): Promise<ExternalTrackSuggestion[]>
}

export class NullSimilarTrackProvider implements SimilarTrackProvider {
  readonly name = 'none'

  async findSimilar(): Promise<ExternalTrackSuggestion[]> {
    return []
  }
}
