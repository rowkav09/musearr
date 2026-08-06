# Musearr

**Early Beta v0.1.0 — a self-hosted, local-first intelligence layer for your Plex music library.**

Musearr keeps the useful context around a music library close to the server that owns it. It mirrors selected Plex music-library and playlist data into a local PostgreSQL database, gives one local owner a dashboard and setup flow, and runs bounded background work for imports, reconciliation, and daily briefings.

This is an early beta for people who are comfortable operating Docker Compose and reviewing a changing product. It is not a hosted service, a Plex replacement, or a promise of production-grade hardening. Read [Self-hosting](docs/SELF_HOSTING.md) and [Privacy](docs/PRIVACY.md) before exposing an instance beyond a private network.

## What works in v0.1.0

- A self-hostable stack: Next.js dashboard, Fastify API, PostgreSQL, background worker, and Caddy reverse proxy.
- Single-owner setup with a Plex connection test and encrypted-at-rest Plex-token storage.
- Selected Plex music-library and user-playlist imports, using bounded pages, idempotent upserts, durable jobs, and scheduled reconciliation.
- Stored sync-run status and a dashboard that distinguishes not-started, queued, running, completed, failed, and cancelled work.
- A locally stored, timezone-aware daily briefing; optional Discord webhook delivery is worker-only and retry-safe.
- Container builds and pull-request validation for lint/type checks, tests, production builds, Docker builds, and Compose validation. See [CI](docs/CI.md).

## What is planned, not a current promise

Musearr is still turning its foundation into a dependable library companion. Planned work includes fixture-driven Plex-import correctness, resumability and recovery verification, explainable recommendations and playlists, review-first metadata intelligence, and carefully scoped optional integrations.

The detailed product intent and milestones live in the [product blueprint](docs/PRODUCT_BLUEPRINT.md). Treat that document as direction, not a guarantee of delivery dates or supported behavior.

## Deliberate non-goals

Musearr does **not** currently:

- download, stream, or play audio;
- replace Plex or control Plex playback;
- silently write metadata or audio files back to Plex;
- provide a hosted cloud account, multi-user tenancy, social features, or external discovery as part of the core path;
- require or depend on a hosted LLM.

Any future metadata change must be review-first, consented to, and auditable. The core product remains focused on the library you already own.

## Architecture at a glance

```text
Browser → Caddy → Next.js dashboard → Fastify API → PostgreSQL
                                        ↑             ↑
Plex Media Server ──────────────────────┘             │
Background worker ─────────────────────────────────────┘
```

The browser uses same-origin API routes. The API is the only gateway to Plex and PostgreSQL; encrypted Plex credentials do not enter the browser. PostgreSQL holds the library mirror, durable jobs, sync history, and locally generated briefings. The worker performs bounded imports, reconciliation, and optional outbound Discord delivery. See [Architecture](docs/ARCHITECTURE.md) for the implementation reference.

## Self-hosting quick start

1. Install Docker Compose, then copy `.env.example` to `.env`.
2. Generate unique 32-byte base64 values for `MUSEARR_ENCRYPTION_KEY` and `MUSEARR_SESSION_SECRET`; do not reuse them between instances.
3. Review `MUSEARR_WEB_ORIGIN`, network exposure, and optional webhook settings.
4. Start a source build:

   ```sh
   docker compose up --build
   ```

5. Open the dashboard at `http://localhost:3000` and complete the local setup flow.

For development, use Node.js 24, `npm install`, `docker compose up db -d`, `npm run migrate`, then run `npm run dev:web`, `npm run dev:api`, and `npm run dev:worker` in separate terminals.

For release-image deployment instructions, configuration notes, and operational limitations, read [Self-hosting](docs/SELF_HOSTING.md). Keep an early-beta instance behind an authenticated private network or reverse proxy as described in [SECURITY.md](SECURITY.md).

## Privacy and security

Musearr is designed to keep Plex library context local, but early beta is not a substitute for your own threat model or operational controls.

- Plex tokens are encrypted at rest with an application key; session cookies are HttpOnly and same-site.
- Library and playlist data are stored in the PostgreSQL database you operate.
- Optional Discord delivery sends the persisted daily briefing to the webhook URL you configure; it is not sent to browsers.
- Treat Plex tokens, webhook URLs, database credentials, and Musearr secrets as passwords. Never commit `.env` or paste them into issues, logs, or pull requests.

See [Privacy](docs/PRIVACY.md) for data-flow and limitation details, and [Security policy](SECURITY.md) for private vulnerability reporting.

## Documentation and contributing

- [Self-hosting guide](docs/SELF_HOSTING.md)
- [Privacy notes](docs/PRIVACY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Product blueprint](docs/PRODUCT_BLUEPRINT.md)
- [CI and delivery](docs/CI.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

Contributions are welcome as focused, tested pull requests. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before starting non-trivial work, and use GitHub's private security-advisory flow for vulnerabilities.

Musearr is available under the [MIT License](LICENSE.md).
