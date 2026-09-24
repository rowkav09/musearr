# Public roadmap

Musearr is a private, explainable intelligence companion for a Plex music library. This roadmap communicates direction, not dates or delivery guarantees. For product scope and architecture, see the [product blueprint](PRODUCT_BLUEPRINT.md).

## Status labels

- **Committed** — actively prioritized work with a defined near-term outcome.
- **Exploring** — a direction under consideration; scope, sequencing, and delivery are not promised.
- **Not planned** — intentionally outside the MVP direction. This can change only through an explicit product decision.

Items may move between sections as we learn from implementation and self-hosted use. We do not make date promises on this page.

## Now

### Committed — trustworthy first library

- Verify Plex import correctness against fixtures and expected entity manifests.
- Complete resumability, checkpoint, retry, idempotency, and recovery verification for sync work.
- Keep sync failures safe, sanitized, and actionable in the dashboard.
- Preserve an owner-safe setup, sync, and freshness/status experience.

The near-term exit criteria are fixture import parity, zero duplicate entities, and an actionable failed-sync state.

## Next

### Exploring — intelligence read model

- Library health and listening summaries backed by fast local queries.
- Dashboard views that help an owner understand what they own, what they hear, and whether library data is current.
- Deterministic local taste signals such as artist, genre, decade, recency, repetition, discovery, diversity, and forgotten favourites when source data supports them.

## Later

### Exploring — explainable listening support

- Reproducible recommendations with persisted reason codes, cooldowns, diversity controls, and feedback.
- Reviewable local playlist proposals without Plex write permission.
- Immutable local daily briefings, with optional idempotent Discord delivery.
- Release-candidate hardening: secure Docker installation, backups, observability, tests, and clean-host documentation verification.

## Opt-in, off by default

These exist today but stay disabled until the owner turns them on, and only act on services the owner runs. See the [product blueprint](PRODUCT_BLUEPRINT.md) and [playlist generation](PLAYLIST_GENERATION.md).

- Acquisition of missing tracks for a generated playlist through a Lidarr instance the owner configures.
- Publishing a generated playlist to Plex as a clearly Musearr-managed playlist. Publishes are additive and idempotent; a playlist the owner created is never touched.
- A local AI provider interface for a model the owner hosts. The deterministic pipeline is unchanged when it is off.

## Not planned

The following are not planned for the MVP direction:

- Playback, downloads outside the opt-in Lidarr step above, or a Plexamp replacement.
- Cloud LLMs, external music discovery, social features, multi-user collaboration, or a public plugin marketplace.
- Automatic Plex metadata writes, or any change to playlists the owner created.
- Runtime third-party plugins, a distributed microservice platform, Kubernetes, Redis/Kafka, or a general-purpose workflow engine.

These boundaries keep Musearr local, explainable, review-first, and focused on music already in the owner’s Plex library.
