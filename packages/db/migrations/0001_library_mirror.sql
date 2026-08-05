CREATE TABLE artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plex_server_id uuid NOT NULL REFERENCES plex_servers(id) ON DELETE CASCADE,
  plex_rating_key text NOT NULL,
  name text NOT NULL,
  sort_name text,
  thumb_key text,
  plex_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (plex_server_id, plex_rating_key)
);

CREATE INDEX artists_server_name_idx ON artists (plex_server_id, name);

CREATE TABLE albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  plex_rating_key text NOT NULL,
  title text NOT NULL,
  year integer,
  thumb_key text,
  plex_updated_at timestamptz,
  added_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, plex_rating_key)
);

CREATE INDEX albums_artist_title_idx ON albums (artist_id, title);

CREATE TABLE tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  plex_rating_key text NOT NULL,
  title text NOT NULL,
  track_number integer,
  disc_number integer,
  duration_ms integer,
  added_at timestamptz,
  plex_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (album_id, plex_rating_key)
);

CREATE INDEX tracks_album_order_idx ON tracks (album_id, disc_number, track_number);

CREATE TABLE genres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalised_name citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE item_genres (
  genre_id uuid NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (genre_id, entity_type, entity_id, source)
);

CREATE TABLE user_item_state (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  rating numeric(4,1),
  play_count integer NOT NULL DEFAULT 0,
  skip_count integer NOT NULL DEFAULT 0,
  last_played_at timestamptz,
  first_played_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, entity_type, entity_id)
);

CREATE INDEX user_item_state_track_played_idx ON user_item_state (user_id, last_played_at DESC);
