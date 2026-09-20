CREATE TABLE IF NOT EXISTS playlist_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL,
  algorithm_version text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  plex_playlist_rating_key text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playlist_proposals_user_status_idx ON playlist_proposals(user_id, status, created_at);

CREATE TABLE IF NOT EXISTS playlist_proposal_items (
  proposal_id uuid NOT NULL REFERENCES playlist_proposals(id) ON DELETE CASCADE,
  position integer NOT NULL,
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT playlist_proposal_items_pkey PRIMARY KEY (proposal_id, position)
);

CREATE INDEX IF NOT EXISTS playlist_proposal_items_track_idx ON playlist_proposal_items(track_id);
