# Self-hosting Musearr

Musearr v0.1.0 is an **early beta**. This guide describes the current supported source-build and release-image paths, plus the limits you should account for when operating an instance.

## Before you start

Use Docker Compose on a host you control. Keep the application behind an authenticated private network or reverse proxy; do not expose the early-beta dashboard directly to the public internet.

You need:

- Docker Engine with Docker Compose;
- a reachable Plex Media Server and a Plex token for the owner who will set up Musearr;
- a local PostgreSQL volume managed by Compose (or the database connection configured in `.env`);
- unique secrets for `MUSEARR_ENCRYPTION_KEY` and `MUSEARR_SESSION_SECRET`.

Generate each secret with a cryptographically secure password manager or, for example:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Do not commit `.env`, reuse secrets across instances, or share Plex tokens or webhook URLs.

## Current source-build path

1. Clone this repository and copy `.env.example` to `.env`.
2. Set the two required secrets and review `MUSEARR_WEB_ORIGIN`, `MUSEARR_TIMEZONE`, and `MUSEARR_DAILY_BRIEF_TIME`.
3. Start the stack:

   ```sh
   docker compose up --build
   ```

4. Open `http://localhost:5530` and complete the local owner setup.

Compose starts PostgreSQL, applies forward-only migrations, and then starts the API, worker, web app, and Caddy proxy. The API listens on port `5540` in development; the web app proxies `/api/v1/*` locally.

For local code development, use Node.js 24, run `npm install`, start PostgreSQL with `docker compose up db -d`, apply `npm run migrate`, then run `npm run dev:web`, `npm run dev:api`, and `npm run dev:worker` in separate terminals.

## Current release-image path

After a published container release exists, copy `.env.example` to `.env`, set `MUSEARR_IMAGE_VERSION` to that immutable release version, and run:

```sh
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

The release Compose file defaults to the repository's GitHub Container Registry namespace. Set `MUSEARR_IMAGE_REPOSITORY` only when using a fork or mirror. Published images target `linux/amd64` and `linux/arm64`.

## Data, backup, and upgrades

PostgreSQL stores the local library mirror, queue state, sync runs, setup state, and briefings. Back up the database volume and keep a secure record of the encryption key: losing the key can make encrypted Plex credentials unreadable. Test restore procedures before relying on an instance.

Migrations are forward-only. Review release notes and make a backup before upgrades. The normal reconciliation interval defaults to six hours; optional Plex webhooks can narrow-refresh a selected library, but scheduled reconciliation remains the correctness backstop.

## Optional outbound delivery

Set `MUSEARR_DISCORD_WEBHOOK_URL` only if you want daily briefings delivered to Discord. Delivery is performed by the worker, not the browser, and failed attempts retain a visible local status for retry-safe work. A webhook URL is a secret and should be handled like a password.

## Current limits and planned hardening

**Supported today:** one local owner, one Plex connection, selected music-library and playlist imports, local persistence, durable worker jobs, and optional Discord webhook delivery.

**Not yet a support promise:** public-internet exposure, multi-user deployment, high availability, managed backups, key rotation, exhaustive security hardening, formal recovery guarantees, or a hosted service. Feature and operational work in the [product blueprint](PRODUCT_BLUEPRINT.md) is planned direction, not a delivery guarantee.

Read [Privacy](PRIVACY.md), [Security policy](../SECURITY.md), and [Architecture](ARCHITECTURE.md) before deployment.
