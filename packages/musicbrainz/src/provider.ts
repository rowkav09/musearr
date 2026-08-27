import type { ExternalTrackSuggestion, SimilarSeed, SimilarTrackProvider } from '@musearr/intelligence'
import { MusicBrainzClient, type MusicBrainzClientOptions } from './client.js'

export type MusicBrainzProviderOptions = MusicBrainzClientOptions & {
  /** Cap on MusicBrainz recording look-ups per generation (rate-limit budget). */
  maxLookups?: number
}

/**
 * Deterministic similar-track source backed by MusicBrainz + ListenBrainz.
 * Like the local-AI provider, every failure mode degrades to an empty list so
 * the playlist planner stays library-only rather than emitting noise.
 */
export class MusicBrainzSimilarTrackProvider implements SimilarTrackProvider {
  readonly name = 'musicbrainz'
  private readonly client: MusicBrainzClient
  private readonly maxLookups: number

  constructor(options: MusicBrainzProviderOptions) {
    this.client = new MusicBrainzClient(options)
    this.maxLookups = Math.max(0, options.maxLookups ?? 12)
  }

  async findSimilar(seed: SimilarSeed, limit: number): Promise<ExternalTrackSuggestion[]> {
    if (limit <= 0) {
      return []
    }
    try {
      const seedMbid = await this.client.searchRecording(seed.artistName, seed.trackTitle)
      if (!seedMbid) {
        return []
      }
      const neighbours = await this.client.similarRecordings(seedMbid, Math.max(limit * 3, 30))

      const suggestions: ExternalTrackSuggestion[] = []
      let lookups = 0
      for (const neighbour of neighbours) {
        if (suggestions.length >= limit) {
          break
        }
        let artistName = neighbour.artistName
        let trackTitle = neighbour.recordingName
        let releaseName = neighbour.releaseName

        if ((!artistName || !trackTitle) && lookups < this.maxLookups) {
          lookups += 1
          const metadata = await this.client.lookupRecording(neighbour.recordingMbid)
          if (metadata) {
            artistName = metadata.artistName
            trackTitle = metadata.title
            releaseName = metadata.releaseName
          }
        }

        if (!artistName || !trackTitle) {
          continue
        }
        suggestions.push({
          artistName,
          trackTitle,
          albumTitle: releaseName,
          source: 'musicbrainz',
        })
      }
      return suggestions
    } catch {
      return []
    }
  }
}
