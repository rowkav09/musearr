CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_role AS ENUM ('owner', 'member');
CREATE TYPE plex_server_status AS ENUM ('connected', 'degraded', 'offline');
CREATE TYPE sync_run_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timezone text NOT NULL DEFAULT 'UTC',
  encryption_key_version text NOT NULL DEFAULT 'v1',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'member',
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  disabled_at timestamptz
);

CREATE TABLE plex_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_identifier text NOT NULL UNIQUE,
  name text NOT NULL,
  base_url text NOT NULL,
  token_ciphertext text NOT NULL,
  token_key_version text NOT NULL DEFAULT 'v1',
  status plex_server_status NOT NULL DEFAULT 'connected',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE library_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plex_server_id uuid NOT NULL REFERENCES plex_servers(id) ON DELETE CASCADE,
  plex_section_id text NOT NULL,
  title text NOT NULL,
  type text NOT NULL,
  selected boolean NOT NULL DEFAULT true,
  last_full_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (plex_server_id, plex_section_id)
);

CREATE TABLE sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plex_server_id uuid NOT NULL REFERENCES plex_servers(id) ON DELETE CASCADE,
  library_section_id uuid REFERENCES library_sections(id) ON DELETE SET NULL,
  kind text NOT NULL,
  status sync_run_status NOT NULL DEFAULT 'queued',
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX sync_runs_server_created_at_idx ON sync_runs (plex_server_id, created_at DESC);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_log_target_idx ON audit_log (target_type, target_id);
