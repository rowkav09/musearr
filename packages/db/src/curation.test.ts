import { describe, expect, it } from 'vitest'
import { getCuration, listCurations } from './curation.js'
import type { Database } from './repository.js'

function fakeDatabase(handler: (query: string) => unknown[]): Database {
  const tag = (async (strings: TemplateStringsArray) => handler(strings.join(' ? '))) as unknown as Database
  ;(tag as unknown as { begin: (cb: (tx: Database) => unknown) => Promise<unknown> }).begin = (cb) =>
    Promise.resolve(cb(tag))
  return tag
}

const curationRow = {
  id: '11111111-1111-4111-8111-111111111111',
  playlist_name: 'Focus',
  plex_playlist_rating_key: 'PL1',
  playlist_managed_by_musearr: false,
  status: 'proposed',
  use_ai: true,
  ai_used: true,
  algorithm_version: '2026-08-28.1',
  requested_limit: 20,
  basis_track_count: 12,
  error_summary: null,
  created_at: new Date('2026-08-28T00:00:00.000Z'),
  updated_at: new Date('2026-08-28T00:05:00.000Z'),
  applied_at: null,
}

describe('getCuration', () => {
  it('returns null when the row is missing or not owned', async () => {
    const database = fakeDatabase(() => [])
    await expect(getCuration(database, 'user', curationRow.id)).resolves.toBeNull()
  })

  it('maps the row and derives review counts from its items', async () => {
    const database = fakeDatabase((query) => {
      if (query.includes('FROM playlist_curations')) return [curationRow]
      if (query.includes('FROM playlist_curation_items')) {
        return [
          {
            id: 'a', position: 0, track_id: 't1', plex_rating_key: 'r1', artist_name: 'A',
            track_title: 'S1', score: '0.8', reason_codes: [{ code: 'PLAYLIST_ARTIST' }],
            decision: 'accepted', applied_at: null,
          },
          {
            id: 'b', position: 1, track_id: 't2', plex_rating_key: 'r2', artist_name: 'B',
            track_title: 'S2', score: '0.6', reason_codes: [], decision: 'rejected', applied_at: null,
          },
          {
            id: 'c', position: 2, track_id: 't3', plex_rating_key: 'r3', artist_name: 'C',
            track_title: 'S3', score: '0.5', reason_codes: [], decision: 'suggested', applied_at: null,
          },
        ]
      }
      return []
    })

    const curation = await getCuration(database, 'user', curationRow.id)
    expect(curation?.counts).toEqual({ total: 3, accepted: 1, rejected: 1, suggested: 1, applied: 0 })
    expect(curation?.aiUsed).toBe(true)
    expect(curation?.items[0]).toMatchObject({ id: 'a', score: 0.8, decision: 'accepted' })
    expect(curation?.items[1]?.reasons).toEqual([])
  })
})

describe('listCurations', () => {
  it('derives counts from the aggregated item json', async () => {
    const database = fakeDatabase(() => [
      {
        ...curationRow,
        item_json: [
          { decision: 'accepted', applied: true },
          { decision: 'accepted', applied: false },
          { decision: 'suggested', applied: false },
        ],
      },
    ])
    const [summary] = await listCurations(database, 'user')
    expect(summary?.counts).toEqual({ total: 3, accepted: 2, rejected: 0, suggested: 1, applied: 1 })
  })
})
