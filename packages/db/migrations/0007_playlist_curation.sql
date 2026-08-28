-- Runtime AI settings, AI-assisted curation of existing playlists (review-gated),
-- and library-gap playlist ideas.

CREATE TYPE playlist_curation_status AS ENUM (
  'proposed',
  'approved',
  'applying',
  'applied',
  'partially_applied',
  'failed',
  'dismissed'
);

-- Singleton: the owner's runtime choice for local AI. Env vars are the default;
-- a row here overrides them. keep_alive_seconds: NULL = provider default,
-- 0 = unload immediately after each call, -1 = keep resident, N = seconds.
CREATE TABLE ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'ollama',
  base_url text,
  model text,
  keep_alive_seconds integer,
  auto_start boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ai_settings_singleton ON ai_settings ((true));

-- A proposal to ADD tracks to an existing playlist. Never removes or reorders.
-- The target is denormalised so a playlist-sync blip that drops the mirror row
-- does not destroy an approved-but-unapplied proposal.
CREATE TABLE playlist_curations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  playlist_id uuid REFERENCES playlists(id) ON DELETE SET NULL,
  plex_server_id uuid REFERENCES plex_servers(id) ON DELETE SET NULL,
  plex_playlist_rating_key text NOT NULL,
  playlist_name text NOT NULL,
  playlist_managed_by_musearr boolean NOT NULL DEFAULT false,
  status playlist_curation_status NOT NULL DEFAULT 'proposed',
  use_ai boolean NOT NULL DEFAULT false,
  ai_used boolean NOT NULL DEFAULT false,
  algorithm_version text NOT NULL,
  requested_limit integer NOT NULL,
  basis_track_count integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  applied_at timestamptz
);
CREATE INDEX playlist_curations_user_created_idx ON playlist_curations (user_id, created_at DESC);

CREATE TABLE playlist_curation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curation_id uuid NOT NULL REFERENCES playlist_curations(id) ON DELETE CASCADE,
  position integer NOT NULL,
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  plex_rating_key text NOT NULL,
  artist_name text NOT NULL,
  track_title text NOT NULL,
  score numeric(6, 4) NOT NULL DEFAULT 0,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL DEFAULT 'suggested',
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (curation_id, position),
  UNIQUE (curation_id, track_id)
);
CREATE INDEX playlist_curation_items_curation_idx ON playlist_curation_items (curation_id);

-- A proposed new playlist concept derived from library coverage gaps.
CREATE TABLE playlist_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  rationale text NOT NULL,
  kind text NOT NULL,
  filter jsonb NOT NULL,
  library_track_count integer NOT NULL DEFAULT 0,
  covered_track_count integer NOT NULL DEFAULT 0,
  coverage_ratio numeric(6, 4) NOT NULL DEFAULT 0,
  score numeric(6, 4) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'deterministic',
  algorithm_version text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  generation_id uuid REFERENCES playlist_generations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX playlist_ideas_user_status_idx ON playlist_ideas (user_id, status, score DESC);
