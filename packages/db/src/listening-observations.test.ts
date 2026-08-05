import { describe, expect, it } from 'vitest'
import { derivePlexListeningObservations } from './listening-observations.js'
import type { LibrarySyncSource, LibraryTrackUpsert } from './repository.js'

const source: LibrarySyncSource = {
  plexServerId: 'server-id',
  machineIdentifier: 'plex-machine',
  librarySectionId: 'library-id',
  plexSectionId: '1',
  serverName: 'Plex',
  baseUrl: 'http://plex.local:32400',
  tokenCiphertext: 'ciphertext',
  ownerUserId: 'owner-id',
  ownerTimezone: 'Europe/London',
}

function track(overrides: Partial<LibraryTrackUpsert> = {}): LibraryTrackUpsert {
  return {
    plexRatingKey: 'track-key',
    title: 'Alison',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 210_000,
    addedAt: '2026-01-01T00:00:00.000Z',
    plexUpdatedAt: '2026-08-05T10:00:00.000Z',
    playCount: 5,
    lastPlayedAt: '2026-08-05T09:30:00.000Z',
    rating: 8,
    artist: { plexRatingKey: 'artist-key', name: 'Slowdive', thumbKey: null },
    album: {
      plexRatingKey: 'album-key',
      title: 'Souvlaki',
      year: 1993,
      thumbKey: null,
    },
    genres: ['Dream pop'],
    ...overrides,
  }
}

describe('derivePlexListeningObservations', () => {
  it('labels first-seen historic play counts as aggregate checkpoints', () => {
    const observations = derivePlexListeningObservations({
      source,
      trackId: 'track-id',
      track: track(),
      previousState: undefined,
      observedAt: new Date('2026-08-05T10:00:00.000Z'),
    })

    expect(observations).toEqual([
      expect.objectContaining({
        eventType: 'aggregate_checkpoint',
        playCountDelta: 5,
        timePrecision: 'aggregate',
        occurredAt: '2026-08-05T09:30:00.000Z',
      }),
    ])
  })

  it('records a single newly reported play with its Plex timestamp and a stable idempotency key', () => {
    const input = {
      source,
      trackId: 'track-id',
      track: track({ playCount: 6 }),
      previousState: {
        playCount: 5,
        lastPlayedAt: '2026-08-04T20:00:00.000Z',
        rating: '8',
      },
      observedAt: new Date('2026-08-05T10:00:00.000Z'),
    }

    const first = derivePlexListeningObservations(input)
    const retry = derivePlexListeningObservations(input)

    expect(first).toEqual([
      expect.objectContaining({
        eventType: 'play_count_delta',
        playCountDelta: 1,
        timePrecision: 'exact',
        occurredAt: '2026-08-05T09:30:00.000Z',
      }),
    ])
    expect(retry[0]?.sourceEventId).toBe(first[0]?.sourceEventId)
  })

  it('does not turn a counter reset into negative listening and records an independent rating change', () => {
    const observations = derivePlexListeningObservations({
      source,
      trackId: 'track-id',
      track: track({ playCount: 2, rating: 10 }),
      previousState: {
        playCount: 9,
        lastPlayedAt: '2026-08-04T20:00:00.000Z',
        rating: 8,
      },
      observedAt: new Date('2026-08-05T10:00:00.000Z'),
    })

    expect(observations).toEqual([
      expect.objectContaining({
        eventType: 'play_count_reset',
        playCountDelta: 0,
      }),
      expect.objectContaining({
        eventType: 'rating_change',
        ratingBefore: 8,
        ratingAfter: 10,
      }),
    ])
  })

  it('uses Plex item revision to distinguish a later repeated rating change', () => {
    const first = derivePlexListeningObservations({
      source,
      trackId: 'track-id',
      track: track({
        playCount: 5,
        rating: 10,
        plexUpdatedAt: '2026-08-05T10:00:00.000Z',
      }),
      previousState: {
        playCount: 5,
        lastPlayedAt: '2026-08-04T20:00:00.000Z',
        rating: 8,
      },
      observedAt: new Date('2026-08-05T10:00:00.000Z'),
    })
    const repeated = derivePlexListeningObservations({
      source,
      trackId: 'track-id',
      track: track({
        playCount: 5,
        rating: 10,
        plexUpdatedAt: '2026-08-06T10:00:00.000Z',
      }),
      previousState: {
        playCount: 5,
        lastPlayedAt: '2026-08-04T20:00:00.000Z',
        rating: 8,
      },
      observedAt: new Date('2026-08-06T10:00:00.000Z'),
    })

    expect(first[0]?.sourceEventId).not.toBe(repeated[0]?.sourceEventId)
  })
})
