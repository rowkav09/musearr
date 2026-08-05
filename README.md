# Musearr

Musearr is a local-first, privacy-first music intelligence companion for Plex.

## Current foundation

This repository contains the first vertical slice of the product:

- a self-hostable Next.js dashboard shell;
- a Fastify API with health, setup-status, Plex connection-test, setup completion, and local-owner session endpoints;
- encrypted-at-rest Plex token storage and a forward-only PostgreSQL migration runner;
- a PostgreSQL-backed durable queue and independently deployable worker process that imports selected Plex music libraries in bounded pages; and
- Docker Compose for a local PostgreSQL, API, worker, and web runtime.

The full product blueprint is at [`../docs/MUSEARR_PRODUCT_AND_ARCHITECTURE.md`](../docs/MUSEARR_PRODUCT_AND_ARCHITECTURE.md).

## Local development

1. Copy `.env.example` to `.env` and set strong base64 secrets.
2. Install dependencies with `npm install`.
3. Start PostgreSQL with `docker compose up db -d`, then run `npm run migrate`.
4. In separate terminals, run `npm run dev:api`, `npm run dev:web`, and `npm run dev:worker`.
5. Open `http://localhost:3000` and complete setup.

The API listens on port `4000`; the web app proxies `/api/v1/*` to it in local development. Setup tests Plex before anything is persisted, then encrypts the token and queues the first selected-library sync. Plex tokens and Discord credentials must never be committed to this repository.

## Deployment notes

`docker compose up --build` starts PostgreSQL, runs forward-only SQL migrations, then starts the API, worker, web app, and Caddy proxy. The compose file deliberately refuses to start until `MUSEARR_ENCRYPTION_KEY` and `MUSEARR_SESSION_SECRET` are present in `.env`.

The worker currently mirrors artists, albums, tracks, track genres, ratings, play counts, and last-played values that Plex returns on track pages. It records a `sync_runs` row with page progress, keeps each upsert idempotent, and schedules full reconciliation every six hours by default. Optional Plex webhooks can trigger a narrow selected-library refresh when configured with `MUSEARR_PLEX_WEBHOOK_SECRET`; scheduled reconciliation remains the correctness backstop. Musearr never writes back metadata or audio files in this foundation.
