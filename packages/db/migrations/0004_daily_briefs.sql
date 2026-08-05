CREATE TYPE daily_brief_delivery_status AS ENUM ('pending', 'delivered', 'failed');

CREATE TABLE daily_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brief_date date NOT NULL,
  timezone text NOT NULL,
  algorithm_version text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, brief_date, algorithm_version)
);

CREATE INDEX daily_briefs_user_date_idx
  ON daily_briefs (user_id, brief_date DESC, created_at DESC);

CREATE TABLE daily_brief_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_brief_id uuid NOT NULL REFERENCES daily_briefs(id) ON DELETE CASCADE,
  destination text NOT NULL CHECK (destination = 'discord'),
  status daily_brief_delivery_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (daily_brief_id, destination)
);

CREATE INDEX daily_brief_deliveries_status_idx
  ON daily_brief_deliveries (status, updated_at DESC);
