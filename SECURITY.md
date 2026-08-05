# Security policy

Musearr handles highly personal listening history and Plex credentials. We treat the `main` branch as the supported development line until a stable release policy is published.

## Reporting a vulnerability

Please use [GitHub's private security advisory form](../../security/advisories/new). Include a concise impact assessment, reproduction steps, and any relevant versions. Do not post the vulnerability, secrets, Plex tokens, or private server URLs in a public issue.

We will acknowledge a valid report, investigate privately, and coordinate a fix before disclosure. Please give maintainers reasonable time to respond before sharing details publicly.

## Deployment guidance

Keep Musearr behind an authenticated private network or reverse proxy, use strong unique values for `MUSEARR_ENCRYPTION_KEY` and `MUSEARR_SESSION_SECRET`, and treat Plex tokens as passwords. Update container images promptly once stable releases are available.
