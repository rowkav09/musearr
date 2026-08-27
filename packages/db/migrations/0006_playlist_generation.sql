-- Playlist generation from a seed track, optional Lidarr acquisition of gap
-- tracks, and optional publish of a Musearr-managed playlist back to Plex.

CREATE TYPE playlist_generation_status AS ENUM (
  'generating',
  'awaiting_acquisition',
  'ready',
  'publishing',
  'published',
  'partially_published',
  'failed'
);

CREATE TYPE playlist_generation_item_state AS ENUM (
  'in_library',
  'pending',
  'requested',
  'downloading',
  'imported',
  'matched',
  'unavailable'
);

-- Optional acquisition backend. The owner points Musearr at a Lidarr instance
-- they already run; the API key is encrypted at rest like the Plex token.
CREATE TABLE lidarr_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url text NOT NULL,
  api_key_ciphertext text NOT NULL,
  api_key_key_version text NOT NULL DEFAULT 'v1',
  instance_name text,
  version text,
  root_folder_path text,
  quality_profile_id integer,
  metadata_profile_id integer,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Single-owner instance: at most one Lidarr connection row.
CREATE UNIQUE INDEX lidarr_connections_singleton ON lidarr_connections ((true));

CREATE TABLE playlist_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed_track_id uuid REFERENCES tracks(id) ON DELETE SET NULL,
  seed_label text NOT NULL,
  name text NOT NULL,
  status playlist_generation_status NOT NULL DEFAULT 'generating',
  algorithm_version text NOT NULL,
  target_size integer NOT NULL,
  acquire_missing boolean NOT NULL DEFAULT false,
  publish_to_plex boolean NOT NULL DEFAULT false,
  plex_playlist_id uuid REFERENCES playlists(id) ON DELETE SET NULL,
  input_snapshot_at timestamptz NOT NULL DEFAULT NOW(),
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  published_at timestamptz
);

CREATE INDEX playlist_generations_user_created_idx
  ON playlist_generations (user_id, created_at DESC);
CREATE INDEX playlist_generations_active_idx
  ON playlist_generations (status)
  WHERE status IN ('awaiting_acquisition', 'ready', 'publishing');

CREATE TABLE playlist_generation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES playlist_generations(id) ON DELETE CASCADE,
  position integer NOT NULL,
  track_id uuid REFERENCES tracks(id) ON DELETE SET NULL,
  plex_rating_key text,
  artist_name text NOT NULL,
  album_title text,
  track_title text NOT NULL,
  state playlist_generation_item_state NOT NULL DEFAULT 'pending',
  score numeric(6, 4) NOT NULL DEFAULT 0,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  lidarr_artist_id integer,
  lidarr_album_id integer,
  acquisition_requested_at timestamptz,
  matched_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (generation_id, position)
);

CREATE INDEX playlist_generation_items_generation_idx
  ON playlist_generation_items (generation_id);
CREATE INDEX playlist_generation_items_state_idx
  ON playlist_generation_items (state)
  WHERE state IN ('requested', 'downloading', 'imported');
CREATE INDEX playlist_generation_items_publishable_idx
  ON playlist_generation_items (generation_id)
  WHERE plex_rating_key IS NOT NULL AND published_at IS NULL;

-- One row per publish attempt; publishes are additive and safe to retry.
CREATE TABLE playlist_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES playlist_generations(id) ON DELETE CASCADE,
  plex_server_id uuid NOT NULL REFERENCES plex_servers(id) ON DELETE CASCADE,
  plex_playlist_rating_key text,
  requested_item_count integer NOT NULL DEFAULT 0,
  published_item_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX playlist_publications_generation_idx
  ON playlist_publications (generation_id, created_at DESC);
