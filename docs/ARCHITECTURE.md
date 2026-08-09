# Musearr System Architecture & Component Mapping

This document provides a detailed overview of the system architecture, network boundaries, and structural components of Musearr.

---

## 1. Network Topography & Port Mapping

Musearr runs behind a local **Caddy reverse proxy** which acts as the same-origin ingress. To prevent port clashes with other local development environments or commonly used software, Musearr uses custom, non-clashing port defaults:

- **Web Dashboard Ingress**: Port `5530` (exposed on the host as `MUSEARR_PORT` mapped to Caddy port 80).
- **Local API Ingress**: Port `5540` (exposed on the host as `MUSEARR_API_PORT` for direct developer server access).

### Local Data Flow:
```text
Browser ────► [Host Port 5530] Caddy Ingress
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼ (Routes starting /api/v1/*)       ▼ (Other requests)
          Fastify API (api:5540)             Next.js Web (web:3000)
```

Inside the internal Docker bridge network (`app`), the components communicate on isolated addresses, and Caddy proxies host-bound traffic appropriately.

---

## 2. Core Monorepo Packages & Services

The codebase is split into modular monorepo packages to maintain strict separation of concerns:

| Component / Package | Code Location | Key Role & Responsibilities |
| :--- | :--- | :--- |
| **Dashboard Shell** | `apps/web/` | Presentational frontend built with Next.js App Router. It is client-only and interacts exclusively with the local API. |
| **Local API Server** | `apps/api/` | Schema-validated API endpoints utilizing Fastify and Zod, managing setup completion, token storage, and webhook notifications. |
| **Background Worker** | `apps/worker/` | Independent background processor running continuous schedules for reconciliation, daily briefing compiles, and queue jobs. |
| **Database Package** | `packages/db/` | Controls forward-only migrations and direct Postgres repositories, including safe JSON-B parsers. |
| **Plex Adapter** | `packages/plex/` | Handles network requests to the Plex Media Server API, mapping raw responses into normalized TypeScript definitions. |
| **Intelligence Engine**| `packages/intelligence/` | Houses pure deterministic algorithms, ranking calculations, decay scores, and daily brief layouts. |

---

## 3. Security, Authenticity & SSRF Mitigation

Because Musearr acts as an on-premise proxy between your local browser and local Plex instance, security is paramount:

### A. Encrypted Credentials-at-Rest
Plex tokens are never exposed to the browser. They are encrypted with `AES-256-GCM` using the user's secret `MUSEARR_ENCRYPTION_KEY` in `packages/core/src/secrets.ts` and stored as ciphertexts in PostgreSQL.

### B. Single-Owner Setup Lock
All configuration endpoints—specifically PIN authentication start/poll flows and connection tests (`/api/v1/setup/test-plex`)—are secured once setup is complete. Any attempt to access them after initial configuration results in a `409 INSTANCE_ALREADY_CONFIGURED` response. This mitigates:
- Unauthorized reconfiguration.
- **Server-Side Request Forgery (SSRF)**: Prevents attackers from using the setup connection test to probe ports or trigger network calls on internal host networks.

### C. Isolated Cookie Sessions
Session authentication uses HttpOnly, same-site signed JSON Web Tokens (JWT) to secure user interactions.

---

## 4. Durable Job Queue & Scheduled Tasks

Background tasks are managed using a PostgreSQL-backed queue (**pg-boss**), preventing the need to operate additional systems like Redis.

### Bounded Sync Cycle:
1. **Trigger**: Sync is triggered manually from the dashboard recovery card (`POST /api/v1/sync`), scheduled via cron (every 6 hours), or notified via a Plex Webhook.
2. **Locking**: A library section sync is locked via pg-boss's singleton keys to prevent duplicate concurrent runs.
3. **Execution**: The worker fetches the library, handles pagination, upserts records, and reports offset progress to the DB.
4. **Failure Recovery**: On exception, the worker translates errors into classified failures (`upstream_unavailable`, `authentication`, etc.) so they are safely displayed on the dashboard for manual retry.
