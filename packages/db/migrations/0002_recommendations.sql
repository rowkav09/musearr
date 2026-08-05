CREATE TYPE recommendation_run_status AS ENUM ('running', 'completed', 'failed');

CREATE TABLE recommendation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('daily_mix', 'forgotten_favourites', 'hidden_gems', 'recently_added')),
  algorithm_version text NOT NULL,
  input_snapshot_at timestamptz NOT NULL DEFAULT NOW(),
  status recommendation_run_status NOT NULL DEFAULT 'running',
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz
);

CREATE INDEX recommendation_runs_user_kind_created_idx
  ON recommendation_runs (user_id, kind, created_at DESC);

CREATE TABLE recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES recommendation_runs(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank > 0),
  score numeric(6,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  reason_codes jsonb NOT NULL,
  explanation_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, rank),
  UNIQUE (run_id, track_id)
);

CREATE INDEX recommendations_track_idx ON recommendations (track_id, created_at DESC);
