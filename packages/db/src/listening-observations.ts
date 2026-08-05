import type { LibrarySyncSource, LibraryTrackUpsert } from './repository.js'

type StoredTrackListeningState = {
  playCount: number
  lastPlayedAt: Date | string | null
  rating: number | string | null
}

export type ListeningObservation = {
  sourceEventId: string
  eventType: 'aggregate_checkpoint' | 'play_count_delta' | 'rating_change' | 'play_count_reset'
  occurredAt: Date | string
  playCountDelta: number
  ratingBefore: number | null
  ratingAfter: number | null
  durationMs: number | null
  timePrecision: 'exact' | 'observed' | 'aggregate'
  metadata: Record<string, number | string>
}

export function derivePlexListeningObservations(input: {
  source: LibrarySyncSource
  trackId: string
  track: LibraryTrackUpsert
  previousState: StoredTrackListeningState | undefined
  observedAt: Date
}): ListeningObservation[] {
  const previous = input.previousState
  const previousRating = numericOrNull(previous?.rating)
  const currentRating = input.track.rating

  if (!previous) {
    return input.track.playCount > 0
      ? [
          {
            sourceEventId: plexObservationId(input, 'aggregate-checkpoint'),
            eventType: 'aggregate_checkpoint',
            occurredAt: input.track.lastPlayedAt ?? input.observedAt,
            playCountDelta: input.track.playCount,
            ratingBefore: null,
            ratingAfter: currentRating,
            durationMs: input.track.durationMs,
            timePrecision: 'aggregate',
            metadata: {
              reportedPlayCount: input.track.playCount,
              source: 'plex_library_sync',
            },
          },
        ]
      : []
  }

  const observations: ListeningObservation[] = []
  const playCountDelta = input.track.playCount - previous.playCount
  if (playCountDelta > 0) {
    const previousLastPlayedAt = serialiseTimestamp(previous.lastPlayedAt)
    const hasExactTimestamp =
      playCountDelta === 1 && input.track.lastPlayedAt !== null && input.track.lastPlayedAt !== previousLastPlayedAt
    observations.push({
      sourceEventId: plexObservationId(input, 'play-count-delta'),
      eventType: 'play_count_delta',
      occurredAt: hasExactTimestamp ? input.track.lastPlayedAt! : input.observedAt,
      playCountDelta,
      ratingBefore: null,
      ratingAfter: null,
      durationMs: input.track.durationMs,
      timePrecision: hasExactTimestamp ? 'exact' : 'observed',
      metadata: {
        previousPlayCount: previous.playCount,
        reportedPlayCount: input.track.playCount,
        source: 'plex_library_sync',
      },
    })
  } else if (playCountDelta < 0) {
    observations.push({
      sourceEventId: plexObservationId(input, 'play-count-reset'),
      eventType: 'play_count_reset',
      occurredAt: input.observedAt,
      playCountDelta: 0,
      ratingBefore: null,
      ratingAfter: null,
      durationMs: null,
      timePrecision: 'observed',
      metadata: {
        previousPlayCount: previous.playCount,
        reportedPlayCount: input.track.playCount,
        source: 'plex_library_sync',
      },
    })
  }

  if (!ratingsMatch(previousRating, currentRating)) {
    observations.push({
      sourceEventId: plexObservationId(input, 'rating-change'),
      eventType: 'rating_change',
      occurredAt: input.observedAt,
      playCountDelta: 0,
      ratingBefore: previousRating,
      ratingAfter: currentRating,
      durationMs: null,
      timePrecision: 'observed',
      metadata: { source: 'plex_library_sync' },
    })
  }

  return observations
}

function plexObservationId(
  input: {
    source: LibrarySyncSource
    trackId: string
    track: LibraryTrackUpsert
    previousState: StoredTrackListeningState | undefined
  },
  kind: string,
): string {
  const previousPlayCount = input.previousState?.playCount ?? 'initial'
  const previousRating = numericOrNull(input.previousState?.rating) ?? 'unrated'
  const currentRating = input.track.rating ?? 'unrated'
  return [
    'plex',
    kind,
    input.source.plexServerId,
    input.source.ownerUserId,
    input.trackId,
    previousPlayCount,
    input.track.playCount,
    previousRating,
    currentRating,
    input.track.lastPlayedAt ?? 'unknown-time',
    input.track.plexUpdatedAt ?? 'unknown-revision',
  ].join(':')
}

function numericOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function ratingsMatch(left: number | null, right: number | null): boolean {
  return left === right
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
