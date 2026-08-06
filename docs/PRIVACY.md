# Privacy notes

Musearr v0.1.0 is built to keep a Plex music library's intelligence layer on infrastructure you operate. This page explains **current behavior** and separates it from planned security and privacy hardening.

It is not a legal privacy notice, a security certification, or a guarantee that an early-beta deployment meets every requirement of your threat model.

## Current data flow

### Data Musearr stores locally

In the PostgreSQL database you operate, Musearr stores the setup state, selected Plex music-library and user-playlist records, identifiers needed for reconciliation, available track metadata, ratings, play counts, and last-played values returned by Plex. It also stores durable jobs, sync-run status, locally generated daily briefings, and delivery status.

Plex remains the source of truth for imported library data. Musearr does not silently modify Plex metadata or audio files.

### Credentials and browser boundaries

The setup flow tests a Plex connection before storing it. The Plex token is encrypted at rest with `MUSEARR_ENCRYPTION_KEY`. The browser uses same-origin API routes; encrypted Plex credentials are not sent to the browser. Session cookies are configured as HttpOnly and same-site.

These controls depend on your deployment being configured correctly. Protect `MUSEARR_ENCRYPTION_KEY`, `MUSEARR_SESSION_SECRET`, database credentials, Plex tokens, and any webhook URL as secrets. Never put them in source control, public issues, screenshots, or logs.

### Optional outbound transfer

Musearr does not require a hosted account, cloud LLM, external discovery provider, or social service for its core operation.

If you set `MUSEARR_DISCORD_WEBHOOK_URL`, the worker sends the persisted daily briefing to that Discord webhook. The webhook is worker-only and is not exposed to browsers. Sending a briefing transfers the content of that briefing to Discord under Discord's terms and controls; do not enable it unless that is acceptable for your library context.

Optional Plex webhooks can request a narrower selected-library refresh. Plex traffic occurs between the worker/API and the Plex server you configure.

## Retention and control

Your database and its backups are under your control. Deleting or rotating deployment data is an operator responsibility in this early beta. Back up PostgreSQL before changes and protect backups with the same care as the live database.

Changing or losing the encryption key can prevent the instance from reading stored Plex credentials. There is no managed account recovery or hosted backup service.

## Current security posture versus planned hardening

| Area | Current behavior | Planned / not yet guaranteed |
| --- | --- | --- |
| Data location | Library mirror, jobs, and briefings are stored in your PostgreSQL deployment. | Formal retention controls, deletion workflows, and operational guidance beyond this beta. |
| Secrets | Plex tokens are encrypted at rest; session cookies are HttpOnly and same-site. | Key rotation, secret-management integrations, independent security review, and comprehensive hardening. |
| Access model | One local owner and a private-network/reverse-proxy deployment model. | Multi-user roles, public-internet support, and enterprise access controls. |
| Reliability | Bounded, retry-safe jobs and scheduled reconciliation are implemented. | High availability, managed backup/restore, and formal recovery objectives. |
| Outbound data | Discord delivery is opt-in; no hosted LLM is required. | Any future integration will need an explicit product, consent, security, and retention design. |

Keep an early-beta deployment behind an authenticated private network or reverse proxy. Review [Self-hosting](SELF_HOSTING.md), [Architecture](ARCHITECTURE.md), and [SECURITY.md](../SECURITY.md) for deployment and reporting guidance.

## Reporting security issues

Do not disclose vulnerabilities, Plex tokens, private server URLs, or personal listening data in a public issue. Use the private reporting flow described in [SECURITY.md](../SECURITY.md).
