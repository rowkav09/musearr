# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Release policy and public roadmap documentation.
- Playlist generation from a seed track: a deterministic planner (`@musearr/intelligence`),
  `playlist_generations` schema, worker jobs, and `POST /api/v1/playlists/generate`.
- Optional Lidarr integration (`@musearr/lidarr`): owner-configured, encrypted-at-rest
  connection, connection test/save endpoints, and an acquisition step that requests
  "gap" tracks that are not yet in the library.
- Deterministic similar-track source (`@musearr/musicbrainz`): resolves the seed via
  MusicBrainz and reads the ListenBrainz "similar-recordings" dataset, rate-limited
  and with a required contact string. Off by default. `CompositeSimilarTrackProvider`
  runs it before local AI. `GET /api/v1/settings/musicbrainz` reports state.
- `docs/LOCAL_AI.md` now recommends specific small, efficient models for the
  suggestion task (e.g. `qwen2.5:3b`) and small text embedders.
- Optional Plex publish: finished generations can be written back to Plex as a
  Musearr-managed playlist, additively and idempotently.
- Local AI foundation (`@musearr/intelligence/ai`): an off-by-default provider
  interface with a null default and an experimental Ollama adapter. The
  deterministic pipeline is unchanged when it is disabled.
- Runtime Local AI settings: an owner-managed `ai_settings` singleton that
  overrides the `MUSEARR_LOCAL_AI_*` environment defaults. `GET/PUT/DELETE
  /api/v1/settings/local-ai` read, replace, and clear it (the status now reports
  `source` and `autoStart`), and `POST /api/v1/settings/local-ai/test` probes a
  candidate Ollama endpoint without persisting it. The playlist-generation worker
  reads the override before falling back to the environment. `keepAliveSeconds`
  is passed through to Ollama's `keep_alive`.
- A `/settings` page in the dashboard with a Local AI panel: view the effective
  configuration and its source, edit and save the override, test the connection,
  or revert to the environment.
- Optional AI rewording of recommendation reasons (`phraseRecommendationSummaries`
  in `@musearr/intelligence`). The deterministic ranker's score, order, and
  structured reasons are untouched; only the one-line sentence is rephrased from
  the same facts, and any failure keeps the deterministic wording. Stored per
  item as `explanation_data.phrasing`; the dashboard marks reworded lines.

### Fixed

- `recommendations.reason_codes` and `explanation_data` were written with a
  double `JSON.stringify`, so `getLatestRecommendations` returned an empty
  `summary` and a string `reasons` for real reads. They are now stored as proper
  jsonb, and the reader tolerates the legacy shape.

### Changed

- Scope: acquisition (via Lidarr) and Musearr-managed Plex playlist writes are now
  opt-in capabilities rather than blanket non-goals. See the product blueprint
  decision record and `docs/PLAYLIST_GENERATION.md`.

## [0.1.0] - 2026-08-06

### Added

- Foundation monorepo for the Musearr private Plex music intelligence companion.
- API, worker, web, database migration, Docker, and continuous-integration foundations.
- Product blueprint for the trustworthy first-library MVP direction.

[Unreleased]: https://github.com/rowkav09/musearr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rowkav09/musearr/releases/tag/v0.1.0
