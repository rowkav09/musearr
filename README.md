# Musearr

Musearr is a local-first, privacy-first music intelligence companion for Plex.

## Current foundation

This repository contains the first production-minded vertical slice of the product:

- a self-hostable Next.js dashboard shell;
- a Fastify API with health, setup-status, Plex connection-test, setup completion, and local-owner session endpoints;
- encrypted-at-rest Plex token storage and a forward-only PostgreSQL migration runner;
- a PostgreSQL-backed durable queue and independently deployable worker process that imports selected Plex music libraries and user playlists in bounded pages; and
- Docker Compose, multi-stage non-root Docker images, and a GitHub Actions release workflow for a local PostgreSQL, API, worker, and web runtime.

The [product and architecture blueprint](docs/ARCHITECTURE.md) explains the intended MVP and the decisions that keep it extensible without compromising privacy.

## Local development

1. Copy `.env.example` to `.env` and set strong base64 secrets.
2. Install dependencies with `npm install`.
3. Start PostgreSQL with `docker compose up db -d`, then run `npm run migrate`.
4. In separate terminals, run `npm run dev:api`, `npm run dev:web`, and `npm run dev:worker`.
5. Open `http://localhost:3000` and complete setup.

The API listens on port `4000`; the web app proxies `/api/v1/*` to it in local development. Setup tests Plex before anything is persisted, then encrypts the token and queues the first selected-library sync. Plex tokens and Discord credentials must never be committed to this repository.

## Docker deployment

For a source build, run `docker compose up --build`. It starts PostgreSQL, runs forward-only SQL migrations, then starts the API, worker, web app, and Caddy proxy. The compose file deliberately refuses to start until `MUSEARR_ENCRYPTION_KEY` and `MUSEARR_SESSION_SECRET` are present in `.env`.

Version tags will publish GitHub Container Registry images for `linux/amd64` and `linux/arm64`. Once a release image exists, copy `.env.example` to `.env`, set `MUSEARR_IMAGE_VERSION` to its immutable release version (for example, `0.1.0`), then run:

```sh
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

The release compose file defaults to this repository's GitHub Container Registry namespace. Set `MUSEARR_IMAGE_REPOSITORY` when deploying images from a fork or a mirrored registry. `docker-bake.hcl` is included for maintainers building all four images locally with Docker Buildx.

The worker currently mirrors artists, albums, tracks, track genres, ratings, play counts, and last-played values that Plex returns on track pages. It records a `sync_runs` row with page progress, keeps each upsert idempotent, and schedules full reconciliation every six hours by default. Optional Plex webhooks can trigger a narrow selected-library refresh when configured with `MUSEARR_PLEX_WEBHOOK_SECRET`; scheduled reconciliation remains the correctness backstop. Musearr never writes back metadata or audio files in this foundation.

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use the GitHub issue forms for reproducible bugs and outcome-focused feature requests. Security concerns belong in the private reporting flow described in [SECURITY.md](SECURITY.md), never in a public issue.

Musearr is available under the [MIT License](LICENCE.md).
