import { describe, expect, it } from 'vitest'
import { upsertUserPlaylists, type Database } from './repository.js'

function recordingDatabase() {
  const statements: string[] = []
  const transaction = (async (strings: TemplateStringsArray) => {
    const query = strings.join('?').replace(/\s+/g, ' ')
    statements.push(query)
    if (query.includes('INSERT INTO playlists')) return [{ id: 'playlist-row-1' }]
    return []
  }) as unknown as Database
  const database = {
    begin: async (callback: (tx: Database) => Promise<unknown>) => callback(transaction),
  } as unknown as Database
  return { database, statements }
}

const source = {
  plexServerId: 'server-1',
  machineIdentifier: 'machine-1',
  librarySectionId: 'section-row-1',
  plexSectionId: '4',
  serverName: 'Test Plex',
  baseUrl: 'http://plex.local:32400',
  tokenCiphertext: 'unused',
  ownerUserId: 'user-1',
  ownerTimezone: 'Europe/London',
}

describe('upsertUserPlaylists', () => {
  it('keeps the kind of Musearr-managed playlists when Plex lists them back', async () => {
    const { database, statements } = recordingDatabase()

    await upsertUserPlaylists(database, source, [{ plexRatingKey: '9001', title: 'Late Night', revision: null, items: [] }])

    const upsert = statements.find((query) => query.includes('INSERT INTO playlists'))
    expect(upsert).toContain("kind = CASE WHEN playlists.managed_by_musearr THEN playlists.kind ELSE 'user' END")
    expect(upsert).not.toMatch(/SET name = EXCLUDED\.name, kind = 'user'/)
  })

  it('never deletes Musearr-managed playlists that are missing from Plex', async () => {
    const { database, statements } = recordingDatabase()

    await upsertUserPlaylists(database, source, [])

    const deletes = statements.filter((query) => query.includes('DELETE FROM playlists'))
    expect(deletes).toHaveLength(1)
    expect(deletes[0]).toContain('managed_by_musearr = false')
  })
})
