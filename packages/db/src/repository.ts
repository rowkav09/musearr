import postgres from 'postgres'

export type Database = ReturnType<typeof createDatabase>

export type SetupStatusRecord = {
  configured: boolean
  plexServer: {
    name: string
    machineIdentifier: string
    lastSeenAt: string | null
  } | null
}

export type InitialSetup = {
  ownerUsername: string
  passwordHash: string
  machineIdentifier: string
  serverName: string
  baseUrl: string
  tokenCiphertext: string
  selectedLibraries: Array<{ plexSectionId: string; title: string }>
}

export type InitialSetupResult = {
  user: { id: string; username: string; role: 'owner' }
  server: { id: string; name: string; machineIdentifier: string }
}

export type LibrarySyncSource = {
  plexServerId: string
  machineIdentifier: string
  librarySectionId: string
  plexSectionId: string
  serverName: string
  baseUrl: string
  tokenCiphertext: string
  ownerUserId: string
}

export type LibraryTrackUpsert = {
  plexRatingKey: string
  title: string
  trackNumber: number | null
  discNumber: number | null
  durationMs: number | null
  addedAt: string | null
  plexUpdatedAt: string | null
  playCount: number
  lastPlayedAt: string | null
  rating: number | null
  artist: { plexRatingKey: string; name: string; thumbKey: string | null }
  album: { plexRatingKey: string; title: string; year: number | null; thumbKey: string | null }
  genres: string[]
}

export type SyncProgress = {
  offset: number
  importedTracks: number
  skippedTracks: number
}

export type PlexPlaylistUpsert = {
  plexRatingKey: string
  title: string
  revision: string | null
  items: Array<{
    plexTrackRatingKey: string
    addedAt: string | null
  }>
}

export type RecommendationKind =
  | 'daily_mix'
  | 'forgotten_favourites'
  | 'hidden_gems'
  | 'recently_added'

export type RecommendationCandidateRecord = {
  trackId: string
  artistId: string
  artistName: string
  albumId: string
  albumTitle: string
  trackTitle: string
  genres: string[]
  addedAt: string | null
  lastPlayedAt: string | null
  rating: number | null
  playCount: number
}

export type PersistedRecommendation = {
  trackId: string
  rank: number
  score: number
  reasons: object[]
  summary: string
}

export type LatestRecommendation = {
  runId: string
  kind: RecommendationKind
  algorithmVersion: string
  createdAt: string
  trackId: string
  trackTitle: string
  artistName: string
  albumTitle: string
  rank: number
  score: number
  reasons: object[]
  summary: string
}

export function createDatabase(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 8,
    onnotice: () => undefined,
  })
}

export async function getDatabaseStatus(database: Database): Promise<'connected' | 'unavailable'> {
  try {
    await database`SELECT 1`
    return 'connected'
  } catch {
    return 'unavailable'
  }
}

export async function getSetupStatus(database: Database): Promise<SetupStatusRecord> {
  const servers = await database<
    Array<{ name: string; machine_identifier: string; last_seen_at: string | null }>
  >`SELECT name, machine_identifier, last_seen_at FROM plex_servers ORDER BY created_at ASC LIMIT 1`

  const server = servers[0]
  if (!server) {
    return { configured: false, plexServer: null }
  }

  return {
    configured: true,
    plexServer: {
      name: server.name,
      machineIdentifier: server.machine_identifier,
      lastSeenAt: server.last_seen_at,
    },
  }
}

export async function insertInitialSetup(
  database: Database,
  setup: InitialSetup,
): Promise<InitialSetupResult> {
  return database.begin(async (transaction) => {
    const existing = await transaction`SELECT id FROM instances LIMIT 1`
    if (existing.length > 0) {
      throw new Error('INSTANCE_ALREADY_CONFIGURED')
    }

    await transaction`INSERT INTO instances DEFAULT VALUES`
    const users = await transaction<Array<{ id: string; username: string; role: 'owner' }>>`
      INSERT INTO users (username, password_hash, role)
      VALUES (${setup.ownerUsername}, ${setup.passwordHash}, 'owner')
      RETURNING id, username, role
    `
    const user = users[0]
    if (!user) {
      throw new Error('Failed to create the local owner account.')
    }

    const servers = await transaction<Array<{ id: string; name: string; machine_identifier: string }>>`
      INSERT INTO plex_servers (
        machine_identifier,
        name,
        base_url,
        token_ciphertext,
        status,
        last_seen_at
      ) VALUES (
        ${setup.machineIdentifier},
        ${setup.serverName},
        ${setup.baseUrl},
        ${setup.tokenCiphertext},
        'connected',
        NOW()
      )
      RETURNING id, name, machine_identifier
    `
    const server = servers[0]
    if (!server) {
      throw new Error('Failed to save the Plex server.')
    }

    for (const library of setup.selectedLibraries) {
      await transaction`
        INSERT INTO library_sections (plex_server_id, plex_section_id, title, type, selected)
        VALUES (${server.id}, ${library.plexSectionId}, ${library.title}, 'artist', true)
      `
    }

    await transaction`
      INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, metadata)
      VALUES ('system', ${user.id}, 'setup.completed', 'plex_server', ${server.id}, ${JSON.stringify({
        selectedLibraryCount: setup.selectedLibraries.length,
      })}::jsonb)
    `

    return {
      user,
      server: {
        id: server.id,
        name: server.name,
        machineIdentifier: server.machine_identifier,
      },
    }
  })
}

export async function getLibrarySyncSources(
  database: Database,
  librarySectionId?: string,
): Promise<LibrarySyncSource[]> {
  const sources = await database<
    Array<{
      plex_server_id: string
      machine_identifier: string
      library_section_id: string
      plex_section_id: string
      server_name: string
      base_url: string
      token_ciphertext: string
      owner_user_id: string
    }>
  >`
    SELECT
      ps.id AS plex_server_id,
      ps.machine_identifier,
      ls.id AS library_section_id,
      ls.plex_section_id,
      ps.name AS server_name,
      ps.base_url,
      ps.token_ciphertext,
      owner_user.id AS owner_user_id
    FROM library_sections ls
    JOIN plex_servers ps ON ps.id = ls.plex_server_id
    CROSS JOIN LATERAL (
      SELECT id FROM users WHERE role = 'owner' AND disabled_at IS NULL ORDER BY created_at ASC LIMIT 1
    ) owner_user
    WHERE ls.selected = true
    AND (${librarySectionId ?? null}::uuid IS NULL OR ls.id = ${librarySectionId ?? null}::uuid)
    ORDER BY ls.created_at ASC
  `

  return sources.map((source) => ({
    plexServerId: source.plex_server_id,
    machineIdentifier: source.machine_identifier,
    librarySectionId: source.library_section_id,
    plexSectionId: source.plex_section_id,
    serverName: source.server_name,
    baseUrl: source.base_url,
    tokenCiphertext: source.token_ciphertext,
    ownerUserId: source.owner_user_id,
  }))
}

export async function beginSyncRun(
  database: Database,
  source: LibrarySyncSource,
  trigger: 'initial-setup' | 'manual' | 'webhook' | 'reconciliation',
): Promise<string> {
  const result = await database<Array<{ id: string }>>`
    INSERT INTO sync_runs (plex_server_id, library_section_id, kind, status, started_at, cursor, counts)
    VALUES (
      ${source.plexServerId},
      ${source.librarySectionId},
      ${`${trigger}-library-import`},
      'running',
      NOW(),
      ${JSON.stringify({ offset: 0 })}::jsonb,
      ${JSON.stringify({ importedTracks: 0, skippedTracks: 0 })}::jsonb
    )
    RETURNING id
  `
  const run = result[0]
  if (!run) {
    throw new Error('Failed to create a library sync run.')
  }
  return run.id
}

export async function updateSyncProgress(
  database: Database,
  runId: string,
  progress: SyncProgress,
): Promise<void> {
  await database`
    UPDATE sync_runs
    SET cursor = ${JSON.stringify({ offset: progress.offset })}::jsonb,
        counts = ${JSON.stringify({
          importedTracks: progress.importedTracks,
          skippedTracks: progress.skippedTracks,
        })}::jsonb
    WHERE id = ${runId}
  `
}

export async function completeSyncRun(
  database: Database,
  runId: string,
  librarySectionId: string,
  progress: SyncProgress,
): Promise<void> {
  await database.begin(async (transaction) => {
    await transaction`
      UPDATE sync_runs
      SET status = 'completed',
          finished_at = NOW(),
          cursor = ${JSON.stringify({ offset: progress.offset })}::jsonb,
          counts = ${JSON.stringify({
            importedTracks: progress.importedTracks,
            skippedTracks: progress.skippedTracks,
          })}::jsonb
      WHERE id = ${runId}
    `
    await transaction`
      UPDATE library_sections
      SET last_full_sync_at = NOW(), updated_at = NOW()
      WHERE id = ${librarySectionId}
    `
  })
}

export async function failSyncRun(database: Database, runId: string, errorSummary: string): Promise<void> {
  await database`
    UPDATE sync_runs
    SET status = 'failed', finished_at = NOW(), error_summary = ${errorSummary.slice(0, 1_000)}
    WHERE id = ${runId}
  `
}

export async function upsertLibraryTracks(
  database: Database,
  source: LibrarySyncSource,
  tracks: LibraryTrackUpsert[],
): Promise<void> {
  if (tracks.length === 0) {
    return
  }

  await database.begin(async (transaction) => {
    for (const track of tracks) {
      const artists = await transaction<Array<{ id: string }>>`
        INSERT INTO artists (plex_server_id, plex_rating_key, name, thumb_key, plex_updated_at)
        VALUES (
          ${source.plexServerId},
          ${track.artist.plexRatingKey},
          ${track.artist.name},
          ${track.artist.thumbKey},
          ${track.plexUpdatedAt}
        )
        ON CONFLICT (plex_server_id, plex_rating_key) DO UPDATE
        SET name = EXCLUDED.name,
            thumb_key = COALESCE(EXCLUDED.thumb_key, artists.thumb_key),
            plex_updated_at = GREATEST(artists.plex_updated_at, EXCLUDED.plex_updated_at),
            updated_at = NOW()
        RETURNING id
      `
      const artist = artists[0]
      if (!artist) {
        throw new Error('Failed to upsert a Plex artist.')
      }

      const albums = await transaction<Array<{ id: string }>>`
        INSERT INTO albums (artist_id, plex_rating_key, title, year, thumb_key, plex_updated_at)
        VALUES (
          ${artist.id},
          ${track.album.plexRatingKey},
          ${track.album.title},
          ${track.album.year},
          ${track.album.thumbKey},
          ${track.plexUpdatedAt}
        )
        ON CONFLICT (artist_id, plex_rating_key) DO UPDATE
        SET title = EXCLUDED.title,
            year = COALESCE(EXCLUDED.year, albums.year),
            thumb_key = COALESCE(EXCLUDED.thumb_key, albums.thumb_key),
            plex_updated_at = GREATEST(albums.plex_updated_at, EXCLUDED.plex_updated_at),
            updated_at = NOW()
        RETURNING id
      `
      const album = albums[0]
      if (!album) {
        throw new Error('Failed to upsert a Plex album.')
      }

      const savedTracks = await transaction<Array<{ id: string }>>`
        INSERT INTO tracks (
          album_id, plex_rating_key, title, track_number, disc_number, duration_ms, added_at, plex_updated_at
        ) VALUES (
          ${album.id},
          ${track.plexRatingKey},
          ${track.title},
          ${track.trackNumber},
          ${track.discNumber},
          ${track.durationMs},
          ${track.addedAt},
          ${track.plexUpdatedAt}
        )
        ON CONFLICT (album_id, plex_rating_key) DO UPDATE
        SET title = EXCLUDED.title,
            track_number = EXCLUDED.track_number,
            disc_number = EXCLUDED.disc_number,
            duration_ms = EXCLUDED.duration_ms,
            added_at = COALESCE(EXCLUDED.added_at, tracks.added_at),
            plex_updated_at = GREATEST(tracks.plex_updated_at, EXCLUDED.plex_updated_at),
            updated_at = NOW()
        RETURNING id
      `
      const savedTrack = savedTracks[0]
      if (!savedTrack) {
        throw new Error('Failed to upsert a Plex track.')
      }

      await transaction`
        INSERT INTO user_item_state (user_id, entity_type, entity_id, rating, play_count, last_played_at)
        VALUES (
          ${source.ownerUserId},
          'track',
          ${savedTrack.id},
          ${track.rating},
          ${track.playCount},
          ${track.lastPlayedAt}
        )
        ON CONFLICT (user_id, entity_type, entity_id) DO UPDATE
        SET rating = EXCLUDED.rating,
            play_count = EXCLUDED.play_count,
            last_played_at = EXCLUDED.last_played_at,
            updated_at = NOW()
      `

      await transaction`
        UPDATE playlist_items item
        SET track_id = ${savedTrack.id}
        FROM playlists playlist
        WHERE playlist.id = item.playlist_id
        AND playlist.plex_server_id = ${source.plexServerId}
        AND item.plex_track_rating_key = ${track.plexRatingKey}
        AND item.track_id IS NULL
      `

      await transaction`
        DELETE FROM item_genres
        WHERE entity_type = 'track' AND entity_id = ${savedTrack.id} AND source = 'plex'
      `
      for (const genre of track.genres) {
        const normalisedName = normaliseGenre(genre)
        if (!normalisedName) {
          continue
        }
        const genres = await transaction<Array<{ id: string }>>`
          INSERT INTO genres (normalised_name, display_name)
          VALUES (${normalisedName}, ${genre.trim()})
          ON CONFLICT (normalised_name) DO UPDATE SET display_name = EXCLUDED.display_name
          RETURNING id
        `
        const savedGenre = genres[0]
        if (!savedGenre) {
          throw new Error('Failed to upsert a Plex genre.')
        }
        await transaction`
          INSERT INTO item_genres (genre_id, entity_type, entity_id, source)
          VALUES (${savedGenre.id}, 'track', ${savedTrack.id}, 'plex')
          ON CONFLICT DO NOTHING
        `
      }
    }
  })
}

export async function upsertUserPlaylists(
  database: Database,
  source: LibrarySyncSource,
  playlists: PlexPlaylistUpsert[],
): Promise<{ importedPlaylists: number; unresolvedItems: number }> {
  let unresolvedItems = 0

  await database.begin(async (transaction) => {
    const trackRatingKeys = [
      ...new Set(
        playlists.flatMap((playlist) =>
          playlist.items.map((item) => item.plexTrackRatingKey),
        ),
      ),
    ]
    const resolvedTracks =
      trackRatingKeys.length === 0
        ? []
        : await transaction<Array<{ id: string; plexRatingKey: string }>>`
            SELECT track.id, track.plex_rating_key AS "plexRatingKey"
            FROM tracks track
            JOIN albums album ON album.id = track.album_id
            JOIN artists artist ON artist.id = album.artist_id
            WHERE artist.plex_server_id = ${source.plexServerId}
            AND track.plex_rating_key = ANY(${trackRatingKeys}::text[])
          `
    const trackIdsByPlexRatingKey = new Map(
      resolvedTracks.map((track) => [track.plexRatingKey, track.id]),
    )

    for (const playlist of playlists) {
      const savedPlaylists = await transaction<Array<{ id: string }>>`
        INSERT INTO playlists (
          plex_server_id, plex_rating_key, name, kind, managed_by_musearr, revision, last_synced_at
        ) VALUES (
          ${source.plexServerId},
          ${playlist.plexRatingKey},
          ${playlist.title},
          'user',
          false,
          ${playlist.revision},
          NOW()
        )
        ON CONFLICT (plex_server_id, plex_rating_key) DO UPDATE
        SET name = EXCLUDED.name,
            kind = 'user',
            revision = EXCLUDED.revision,
            last_synced_at = NOW(),
            updated_at = NOW()
        RETURNING id
      `
      const savedPlaylist = savedPlaylists[0]
      if (!savedPlaylist) {
        throw new Error('Failed to upsert a Plex playlist.')
      }

      await transaction`DELETE FROM playlist_items WHERE playlist_id = ${savedPlaylist.id}`
      const itemRows = playlist.items.map((item, position) => {
        const trackId = trackIdsByPlexRatingKey.get(item.plexTrackRatingKey) ?? null
        unresolvedItems += trackId ? 0 : 1
        return {
          playlist_id: savedPlaylist.id,
          position,
          plex_track_rating_key: item.plexTrackRatingKey,
          track_id: trackId,
          added_at: item.addedAt,
        }
      })
      for (let start = 0; start < itemRows.length; start += 1_000) {
        const batch = itemRows.slice(start, start + 1_000)
        await transaction`
          INSERT INTO playlist_items ${transaction(
            batch,
            'playlist_id',
            'position',
            'plex_track_rating_key',
            'track_id',
            'added_at',
          )}
        `
      }
    }

    const playlistKeys = playlists.map((playlist) => playlist.plexRatingKey)
    if (playlistKeys.length === 0) {
      await transaction`
        DELETE FROM playlists
        WHERE plex_server_id = ${source.plexServerId}
        AND kind = 'user'
        AND managed_by_musearr = false
      `
    } else {
      await transaction`
        DELETE FROM playlists
        WHERE plex_server_id = ${source.plexServerId}
        AND kind = 'user'
        AND managed_by_musearr = false
        AND NOT (plex_rating_key = ANY(${playlistKeys}::text[]))
      `
    }
  })

  return { importedPlaylists: playlists.length, unresolvedItems }
}

export async function getRecommendationCandidates(
  database: Database,
  userId: string,
): Promise<RecommendationCandidateRecord[]> {
  const rows = await database<
    Array<{
      track_id: string
      artist_id: string
      artist_name: string
      album_id: string
      album_title: string
      track_title: string
      genres: string[] | null
      added_at: Date | string | null
      last_played_at: Date | string | null
      rating: string | number | null
      play_count: number | null
    }>
  >`
    SELECT
      t.id AS track_id,
      artist.id AS artist_id,
      artist.name AS artist_name,
      album.id AS album_id,
      album.title AS album_title,
      t.title AS track_title,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT genre.display_name), NULL) AS genres,
      t.added_at,
      state.last_played_at,
      state.rating,
      state.play_count
    FROM tracks t
    JOIN albums album ON album.id = t.album_id
    JOIN artists artist ON artist.id = album.artist_id
    LEFT JOIN user_item_state state
      ON state.entity_type = 'track' AND state.entity_id = t.id AND state.user_id = ${userId}
    LEFT JOIN item_genres item_genre
      ON item_genre.entity_type = 'track' AND item_genre.entity_id = t.id
    LEFT JOIN genres genre ON genre.id = item_genre.genre_id
    GROUP BY
      t.id, artist.id, artist.name, album.id, album.title, t.title,
      t.added_at, state.last_played_at, state.rating, state.play_count
    ORDER BY artist.name ASC, album.title ASC, t.id ASC
  `

  return rows.map((row) => ({
    trackId: row.track_id,
    artistId: row.artist_id,
    artistName: row.artist_name,
    albumId: row.album_id,
    albumTitle: row.album_title,
    trackTitle: row.track_title,
    genres: row.genres ?? [],
    addedAt: serialiseTimestamp(row.added_at),
    lastPlayedAt: serialiseTimestamp(row.last_played_at),
    rating: row.rating === null ? null : Number(row.rating),
    playCount: row.play_count ?? 0,
  }))
}

export async function beginRecommendationRun(
  database: Database,
  userId: string,
  kind: RecommendationKind,
  algorithmVersion: string,
): Promise<string> {
  const rows = await database<Array<{ id: string }>>`
    INSERT INTO recommendation_runs (user_id, kind, algorithm_version, status)
    VALUES (${userId}, ${kind}, ${algorithmVersion}, 'running')
    RETURNING id
  `
  const run = rows[0]
  if (!run) {
    throw new Error('Failed to create a recommendation run.')
  }
  return run.id
}

export async function completeRecommendationRun(
  database: Database,
  runId: string,
  recommendations: PersistedRecommendation[],
): Promise<void> {
  await database.begin(async (transaction) => {
    for (const recommendation of recommendations) {
      await transaction`
        INSERT INTO recommendations (run_id, track_id, rank, score, reason_codes, explanation_data)
        VALUES (
          ${runId},
          ${recommendation.trackId},
          ${recommendation.rank},
          ${recommendation.score},
          ${JSON.stringify(recommendation.reasons)}::jsonb,
          ${JSON.stringify({ summary: recommendation.summary })}::jsonb
        )
      `
    }
    await transaction`
      UPDATE recommendation_runs
      SET status = 'completed', completed_at = NOW()
      WHERE id = ${runId}
    `
  })
}

export async function failRecommendationRun(
  database: Database,
  runId: string,
  errorSummary: string,
): Promise<void> {
  await database`
    UPDATE recommendation_runs
    SET status = 'failed', completed_at = NOW(), error_summary = ${errorSummary.slice(0, 1_000)}
    WHERE id = ${runId}
  `
}

export async function getLatestRecommendations(
  database: Database,
  userId: string,
  kind?: RecommendationKind,
): Promise<LatestRecommendation[]> {
  const rows = await database<
    Array<{
      run_id: string
      kind: RecommendationKind
      algorithm_version: string
      created_at: Date | string
      track_id: string
      track_title: string
      artist_name: string
      album_title: string
      rank: number
      score: string | number
      reason_codes: object[]
      explanation_data: { summary?: string }
    }>
  >`
    WITH latest_runs AS (
      SELECT DISTINCT ON (kind) id, kind, algorithm_version, created_at
      FROM recommendation_runs
      WHERE user_id = ${userId}
        AND status = 'completed'
        AND (${kind ?? null}::text IS NULL OR kind = ${kind ?? null}::text)
      ORDER BY kind, created_at DESC
    )
    SELECT
      latest_runs.id AS run_id,
      latest_runs.kind,
      latest_runs.algorithm_version,
      latest_runs.created_at,
      t.id AS track_id,
      t.title AS track_title,
      artist.name AS artist_name,
      album.title AS album_title,
      recommendation.rank,
      recommendation.score,
      recommendation.reason_codes,
      recommendation.explanation_data
    FROM latest_runs
    JOIN recommendations recommendation ON recommendation.run_id = latest_runs.id
    JOIN tracks t ON t.id = recommendation.track_id
    JOIN albums album ON album.id = t.album_id
    JOIN artists artist ON artist.id = album.artist_id
    ORDER BY latest_runs.created_at DESC, recommendation.rank ASC
  `

  return rows.map((row) => ({
    runId: row.run_id,
    kind: row.kind,
    algorithmVersion: row.algorithm_version,
    createdAt: serialiseTimestamp(row.created_at) ?? new Date(0).toISOString(),
    trackId: row.track_id,
    trackTitle: row.track_title,
    artistName: row.artist_name,
    albumTitle: row.album_title,
    rank: row.rank,
    score: Number(row.score),
    reasons: row.reason_codes,
    summary: row.explanation_data.summary ?? '',
  }))
}

function normaliseGenre(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
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
