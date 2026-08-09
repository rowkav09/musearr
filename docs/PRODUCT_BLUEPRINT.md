# Musearr Product Blueprint & Intelligence Architecture

This document defines the product vision, current features, technical boundaries, and planned AI/intelligence capabilities of Musearr. It connects our product principles directly to the modules and files in the codebase.

---

## 1. Product Vision & Philosophy

Musearr is a **local-first, privacy-first intelligence and recommendation layer** for your self-hosted Plex music library. It helps collectors understand, explore, and rediscover their music collections without exporting listening history or relying on third-party cloud profiles.

### Core Value Loop:
`Connect Plex Automatically` → `Observe & Control Library Sync` → `Generate Daily Briefings` → `Propose Local Playlists` → `Listen and Enjoy`

---

## 2. Current Features & Code Mapping

This section maps our active production features directly to the modules in our codebase:

### A. Automated Plex Setup & Auto-Discovery
- **Product Intent**: Allow owners to securely authenticate and link their Plex Media Server with a single-click PIN flow, automatically discovering reachable server addresses without copy-pasting tokens.
- **Implementation**:
  - `apps/api/src/plex-auth.ts`: Implements Plex PIN generation, resources retrieval, connectivity testing, and automatic local-subnet candidate selection (preferring `host.docker.internal` on Docker networks).
  - `apps/web/app/setup/setup-connection-form.tsx`: Client Setup Form that orchestrates popup authentication, state polling, and initial library section multi-selection.
  - `apps/web/app/setup/plex-complete/page.tsx`: Callback landing page to notify the parent window of authentication completion and close safely.

### B. Observable, Bounded Library Synchronization
- **Product Intent**: Robustly sync music metadata from Plex in bounded pages, maintaining idempotency and full visibility over sync runs (queued, running, completed, cancelled, failed).
- **Implementation**:
  - `apps/worker/src/jobs/library-sync.ts`: Background job that reads tracks in pages of `200` using the Plex client, upserts them, and updates page-by-page progress.
  - `packages/plex/src/client.ts`: Normalized client wrapper that converts raw Plex XML/JSON formats into typed schemas.
  - `packages/db/src/repository.ts`: Safe database repositories for track, artist, album, and play aggregates.

### C. Active Sync Recovery & Error Classification
- **Product Intent**: If a sync fails, the user is presented with a clear, classified reason (e.g., authentication, network, database) and can trigger a manual retry directly from the dashboard.
- **Implementation**:
  - `apps/web/app/_components/sync-recovery-state.tsx`: Stated dashboard component that fetches recent sync runs, parses classifications, and makes a POST request to re-trigger synchronization.
  - `apps/api/src/server.ts` (`POST /api/v1/sync`): Accepts library retry triggers and queues a singleton pg-boss background sync job.
  - `packages/db/src/repository.ts` (`failSyncRun`): Translates raw JavaScript exceptions into safe, classified failures (`classifySyncFailure`, `safeFailureSummary`).

---

## 3. Local AI & Intelligence Layer (What is built now)

Musearr has a dedicated intelligence package (`packages/intelligence/`) that implements our local taste profiles and recommendation models.

### A. Deterministic Taste & Ranking Engine
- **Code Location**: `packages/intelligence/src/ranking.ts`
- **What it does**: Decides what albums or tracks the owner is likely to love now.
- **Key Concepts**:
  - **Decay Factor**: Calculates recency scores based on when a track was last played, applying time-decay weights so recent listening behaviors rank higher.
  - **Diversity Modifier**: Prevents recommendations from being dominated by a single artist or genre by applying penalties to repeat artist suggestions in a given candidate list.
  - **Genre Affinity**: Aggregates track-level playback histories up to genre nodes to determine current "acoustic texture" preferences.

### B. Stored Daily Briefings
- **Code Location**: `packages/intelligence/src/daily-brief.ts` & `apps/worker/src/jobs/daily-brief.ts`
- **What it does**: Compiles a localized, timezone-aware daily briefing snapshot summarizing library care, sync history, favourite artists, and daily listening mixes.
- **Why it matters**: Generating briefs as a static database snapshot ensures the dashboard is incredibly fast to load and remains stable across client reloads.
- **Outbound Delivery**: `packages/integrations/src/discord.ts` delivers the briefing locally to a Discord webhook safely from the worker node, preventing credentials from ever entering the browser.

---

## 4. Planned AI & Future Intelligence (The Roadmap)

Musearr's modular architecture is designed to integrate local LLMs and offline AI engines seamlessly as opt-in features.

### A. Local LLM Explainability (Natural Language Reasoning)
- **Product Goal**: Translate mathematical scoring arrays (reason codes) into natural, friendly explanations.
- **Planned Implementation**:
  - An offline LLM (e.g., Llama 3 via local Ollama container) is queried by the background worker using a templated prompt of reason codes (e.g., `["discovered_decade_80s", "artist_underplayed"]`).
  - The model generates explanations like: *"You haven't listened to this album by The Cure in 3 months, and you've been leaning heavily into 80s synth-pop this week."*
  - This keeps the data 100% private, with zero token metrics sent to the cloud.

### B. Generative Local Playlists (Review-First Curation)
- **Product Goal**: Propose curated list combinations (e.g., *"Forgotten Gems from the 90s"*) that the user can review, edit, and manually export back to Plex.
- **Planned Implementation**:
  - The intelligence engine builds a playlist draft in PostgreSQL.
  - The dashboard displays the proposed track order, allowing the user to swap, remove, or lock candidates.
  - Once satisfied, a single action publishes the playlist to their Plex server.

### C. Off-Grid Metadata Intelligence & Anomaly Detection
- **Product Goal**: Surface inconsistencies in the user's Plex tags (e.g., albums with split release dates, mistagged genres, or duplicate entries) and suggest corrections.
- **Planned Implementation**:
  - Background audits search for outlier track tags within albums.
  - A local classification model suggests the correct genre, release decade, or artist spelling.
  - Suggestions are review-only; Musearr never modifies music files directly.

---

## 5. Architectural Boundaries & Code Guardrails

To preserve clean separation of concerns as features grow, the monorepo enforces these boundaries:

```text
Browser ────► Caddy (Reverse Proxy) ───► Next.js Dashboard (apps/web)
                                                  │
                                                  ▼
Plex API  ◄─────────────────────────────  Fastify API (apps/api)
                                                  │
                                                  ▼
PostgreSQL ◄──── pg-boss Queue ◄────────── Background Worker (apps/worker)
```

1. **API/Contracts Separation (`packages/contracts/`)**: All network inputs and outputs are parsed and validated using Zod contracts.
2. **Adapters own the Raw format (`packages/plex/`)**: Domain and intelligence logic should never handle raw XML/JSON from Plex. The Plex adapter handles connectivity and maps raw payloads into normalized domain records.
3. **No Database Writes from Frontend**: The Next.js app communicates strictly via origin-secured JSON APIs.
4. **Setup Endpoints Lock**: Security audits ensure that setup connection tests and PIN authentication routes return `409 INSTANCE_ALREADY_CONFIGURED` once the owner has saved their setup. This prevents Server-Side Request Forgery (SSRF) and unauthorized re-configuration.
