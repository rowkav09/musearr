# Contributing to Musearr

Thanks for helping build a thoughtful, private music companion for Plex. Musearr is early-stage, so clear problem statements and small, well-tested changes are more useful than broad feature dumps.

## Before you begin

Open an issue before investing in a non-trivial feature. Explain the listening or library-management problem, the intended user outcome, and how it preserves Musearr's local-first and privacy-first principles. Please do not include Plex tokens, session secrets, private server addresses, or personal listening data in issues, pull requests, screenshots, or logs.

The MVP deliberately does not download media, control Plex playback, silently modify metadata, or depend on a hosted LLM. Contributions in those areas need an agreed product decision first.

## Local setup

1. Use Node.js 24 and Docker Compose.
2. Copy `.env.example` to `.env` and generate fresh local secrets.
3. Run `npm install`.
4. Start PostgreSQL with `docker compose up db -d`, then run `npm run migrate`.
5. Run `npm run check` and `npm test` before opening a pull request.

The web app, API, and worker can be started separately with `npm run dev:web`, `npm run dev:api`, and `npm run dev:worker`.

## Engineering expectations

- Keep types strict and public contracts explicit.
- Treat Plex as the source of truth for imported data. Preserve raw Plex identifiers so records can be reconciled safely.
- Make background work idempotent, bounded, observable, and retry-safe.
- Add forward-only SQL migrations; never alter an already-shipped migration.
- Do not log tokens, passwords, webhook secrets, raw request URLs carrying secrets, or personal library data unnecessarily.
- Metadata proposals must remain review-first, reversible where possible, and recorded in the audit log.
- Prefer deterministic, explainable ranking signals before adding generative AI.

## Pull requests

Keep pull requests focused. Describe the user impact, migration or operational impact, and validation performed. Add tests for new behaviour and screenshots for visible UI changes. The template captures the release checks expected for every contribution.

## Reporting security issues

Use GitHub's private security advisory flow described in [SECURITY.md](SECURITY.md). Do not disclose vulnerabilities in a public issue.
