CREATE TYPE listening_event_type AS ENUM (
  'aggregate_checkpoint',
  'play_count_delta',
  'rating_change',
  'play_count_reset'
);

CREATE TYPE listening_event_precision AS ENUM ('exact', 'observed', 'aggregate');

CREATE TABLE listening_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  plex_server_id uuid NOT NULL REFERENCES plex_servers(id) ON DELETE CASCADE,
  source_event_id text NOT NULL UNIQUE,
  event_type listening_event_type NOT NULL,
  occurred_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT NOW(),
  play_count_delta integer NOT NULL DEFAULT 0 CHECK (play_count_delta >= 0),
  rating_before numeric(4,1),
  rating_after numeric(4,1),
  duration_ms integer,
  time_precision listening_event_precision NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX listening_events_user_occurred_idx
  ON listening_events (user_id, occurred_at DESC);
CREATE INDEX listening_events_user_track_idx
  ON listening_events (user_id, track_id, observed_at DESC);

CREATE TABLE user_track_rollups (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_kind text NOT NULL CHECK (period_kind = 'day'),
  reported_plays integer NOT NULL DEFAULT 0,
  exact_plays integer NOT NULL DEFAULT 0,
  observed_plays integer NOT NULL DEFAULT 0,
  estimated_listened_ms bigint NOT NULL DEFAULT 0,
  last_event_at timestamptz,
  PRIMARY KEY (user_id, track_id, period_start, period_kind)
);

CREATE INDEX user_track_rollups_user_period_idx
  ON user_track_rollups (user_id, period_start DESC);

CREATE TABLE user_artist_rollups (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_kind text NOT NULL CHECK (period_kind = 'day'),
  reported_plays integer NOT NULL DEFAULT 0,
  exact_plays integer NOT NULL DEFAULT 0,
  observed_plays integer NOT NULL DEFAULT 0,
  estimated_listened_ms bigint NOT NULL DEFAULT 0,
  unique_tracks integer NOT NULL DEFAULT 0,
  last_event_at timestamptz,
  PRIMARY KEY (user_id, artist_id, period_start, period_kind)
);

CREATE INDEX user_artist_rollups_user_period_idx
  ON user_artist_rollups (user_id, period_start DESC);
