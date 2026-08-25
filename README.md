# Musearr

[![Version](https://img.shields.io/badge/version-0.1.0--beta-blue.svg)](https://github.com/musearr/musearr/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENCE.md)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![Docker Compose](https://img.shields.io/badge/docker--compose-supported-blue.svg)](docker-compose.yml)
[![CI](https://github.com/musearr/musearr/actions/workflows/ci.yml/badge.svg)](https://github.com/musearr/musearr/actions/workflows/ci.yml)

**A self-hosted, local-first music intelligence companion for your Plex Media Server.**

Musearr syncs and mirrors your Plex music library and user playlists into a local PostgreSQL database, providing a single-owner web dashboard, durable background jobs, automated reconciliation, and timezone-aware daily music briefings.

---

## Key Features

- **Plex Syncing & Mirroring:** Import music libraries, albums, artists, tracks, and playlists incrementally using bounded pagination and idempotent upserts.
- **Local-First & Private:** All Plex library data, token credentials, sync histories, and briefings remain on your infrastructure. Plex tokens are encrypted at rest using AES-256 encryption.
- **Durable Background Jobs:** Tracks job statuses (`queued`, `running`, `completed`, `failed`, `cancelled`) with background execution and scheduled reconciliation.
- **Daily Briefings:** Generates timezone-aware daily music summaries locally, with optional outbound Discord webhook delivery managed safely by the background worker.
- **Production-Ready Stack:** Built on Next.js 15, Fastify 5, PostgreSQL 16, Caddy reverse proxy, and Docker Compose.

---

## Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | Next.js 15 (React 19, Tailwind CSS) | Single-owner management dashboard and setup wizard |
| **API** | Fastify 5 (TypeScript) | Secure backend REST API handling auth, sync controls, and database operations |
| **Worker** | Node.js (TypeScript) | Background job processor for imports, reconciliation, and webhook dispatch |
| **Database** | PostgreSQL 16 | Primary data store for library mirrors, job queues, and daily briefings |
| **Reverse Proxy** | Caddy | Ingress routing, SSL termination, and same-origin API proxying |

---

## System Architecture

```text
Browser / Client
      │
      ▼
┌───────────┐
│   Caddy   │ (Reverse Proxy)
└─────┬─────┘
      │
      ├──────────────────────┐
      ▼                      ▼
┌───────────┐          ┌───────────┐
│ Next.js   │          │  Fastify  │
│ Dashboard │          │    API    │
└───────────┘          └─────┬─────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
┌───────────┐         ┌─────────────┐       ┌─────────────────┐
│ PostgreSQL│ ◄───────┤ Background  │ ────► │ Plex Media      │
│ Database  │         │   Worker    │       │ Server          │
└───────────┘         └──────┬──────┘       └─────────────────┘
                             │
                             ▼
                      ┌─────────────┐
                      │ Discord     │ (Optional)
                      │ Webhook     │
                      └─────────────┘
```

The Fastify API acts as the sole access layer to PostgreSQL and Plex. Encrypted credentials and tokens are strictly stored on the server side and never exposed to the frontend browser interface.

---

## Quick Start (Docker Compose)

### Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/) (v24.0+) and [Docker Compose](https://docs.docker.com/compose/install/) (v2.20+)
- A running [Plex Media Server](https://www.plex.tv/) instance with a music library

### Setup & Run

1. **Clone the repository:**

   ```sh
   git clone https://github.com/musearr/musearr.git
   cd musearr
   ```

2. **Configure environment variables:**

   ```sh
   cp .env.example .env
   ```

   Generate secure 32-byte base64 keys for application encryption and session management:

   ```sh
   openssl rand -base64 32 # Use for MUSEARR_ENCRYPTION_KEY
   openssl rand -base64 32 # Use for MUSEARR_SESSION_SECRET
   ```

   Update `MUSEARR_ENCRYPTION_KEY` and `MUSEARR_SESSION_SECRET` in your `.env` file.

3. **Start the application:**

   ```sh
   docker compose up -d --build
   ```

4. **Access the Web Dashboard:**

   Open `http://localhost:3000` in your browser and complete the initial setup flow to connect your Plex account.

---

## Local Development Setup

### Prerequisites

- Node.js >= 22.0.0
- npm >= 10.0.0
- Docker (for local PostgreSQL instance)

### Setup Steps

1. **Install dependencies:**

   ```sh
   npm install
   ```

2. **Start PostgreSQL database:**

   ```sh
   docker compose up db -d
   ```

3. **Run database migrations:**

   ```sh
   npm run migrate
   ```

4. **Start development servers:**

   Run the following commands in separate terminal sessions:

   ```sh
   npm run dev:web    # Next.js frontend (http://localhost:3000)
   npm run dev:api    # Fastify API (http://localhost:3001)
   npm run dev:worker # Background worker
   ```

---

## Testing & Quality Assurance

Run the test suite and static checks across all monorepo packages:

```sh
# Run code linting and TypeScript type checking
npm run check

# Run Vitest test suite
npm test
```

---

## Non-Goals & Scope

Musearr is intentionally designed as a lightweight metadata intelligence layer. It explicitly does **not**:

- Stream, play, or download audio files.
- Replace Plex Media Server or alter audio playback devices.
- Unilaterally modify or overwrite audio file tags or server media files.
- Require cloud subscriptions or third-party SaaS infrastructure.

---

## Documentation

- [Self-Hosting Guide](docs/SELF_HOSTING.md) — Comprehensive deployment options, reverse proxy configurations, and production hardening.
- [Architecture Reference](docs/ARCHITECTURE.md) — Detailed technical breakdown of database schemas, API routes, and background jobs.
- [Product Blueprint](docs/PRODUCT_BLUEPRINT.md) — Long-term roadmap, design principles, and planned features.
- [Privacy Policy](docs/PRIVACY.md) — Data flow analysis and local-first security practices.
- [CI/CD Workflow](docs/CI.md) — GitHub Actions pipeline details and Docker build specifications.
- [Contributing Guidelines](CONTRIBUTING.md) — Code style, pull request process, and development standards.
- [Security Policy](SECURITY.md) — Security advisories and vulnerability reporting protocols.

---

## License

This project is licensed under the [MIT License](LICENCE.md).
