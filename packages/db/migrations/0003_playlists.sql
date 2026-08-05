CREATE TABLE playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plex_server_id uuid NOT NULL REFERENCES plex_servers(id) ON DELETE CASCADE,
  plex_rating_key text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'user',
  managed_by_musearr boolean NOT NULL DEFAULT false,
  revision text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (plex_server_id, plex_rating_key)
);

CREATE INDEX playlists_server_sync_idx ON playlists (plex_server_id, last_synced_at DESC);

CREATE TABLE playlist_items (
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  position integer NOT NULL,
  plex_track_rating_key text NOT NULL,
  track_id uuid REFERENCES tracks(id) ON DELETE SET NULL,
  added_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (playlist_id, position)
);

CREATE INDEX playlist_items_track_idx ON playlist_items (track_id) WHERE track_id IS NOT NULL;
CREATE INDEX playlist_items_unresolved_idx ON playlist_items (plex_track_rating_key) WHERE track_id IS NULL;
