# Musearr Bug & TODO Backlog / Repository-wide Audit

This document details the issues identified during a thorough repository-wide audit of the Musearr repository, including triage results of existing pull request branches.

---

## 1. Pull Request (PR) Triage & Audit Results

We analyzed all candidate branches in the repository relative to `origin/main` to identify necessary, technically correct, and compatible improvements:

| Branch Name | Chronological Date | Status / Triage Decision | Description / Notes |
| :--- | :--- | :--- | :--- |
| `origin/feat/m1-sync-observability-contracts` | Thu Aug 6 08:24:51 2026 | **Already Merged** | Integrated into `main`'s core database/contracts schema. |
| `origin/feat/m1-sync-observability-api` | Thu Aug 6 08:28:27 2026 | **Already Merged** | Integrated into `main`'s core API. |
| `origin/feat/m1-sync-observability-api-v2` | Thu Aug 6 08:42:08 2026 | **Already Merged** | Integrated into `main`'s core API test suite. |
| `origin/feat/web-sync-state` | Thu Aug 6 08:48:12 2026 | **Obsolete / Rejected** | Tried to track simple error summaries but was completely superseded by the superior classified failure system (`sanitiseSyncFailure`) already merged in `main`. |
| `origin/ci/*` & `origin/docs/*` | Thu Aug 6 08:53:20 to 09:55:29 2026 | **Already Merged** | All workflow, release tag gates, and positioning/blueprint docs are fully integrated in `main`. |
| `origin/feat/web-sync-recovery-states` | Thu Aug 6 08:39:44 2026 | **Incorporated & Fixed** | Adds active `SyncRecoveryState` card to dashboard to show detailed run progress and retry failed sync libraries. Breaks Next.js build under strict TS; fixed during integration. |
| `origin/development` | Thu Aug 6 19:17:09 2026 | **Incorporated** | Automates Plex setup with PINs and auto-discovery, removing manual token copying. Has minor PowerShell formatting issues; fixed during integration. |
| `origin/feat/ui-controls-sync-progress` | Thu Aug 6 21:00:25 2026 | **Incorporated** | Built on top of `development`. Safely parses recommendation JSON from DB. Incorporated fully. |

---

## 2. Bug & Security Backlog

### Issue 1: Unauthenticated Setup Connection Test SSRF (Server-Side Request Forgery)
- **Severity**: High
- **Affected Component/Files**: `apps/api/src/server.ts`
- **Description**: The `/api/v1/setup/test-plex` endpoint is completely unauthenticated and does not check whether the instance has already been set up. After the local owner finishes configuration, any remote attacker can still hit this endpoint to force the server to perform arbitrary internal network requests (e.g. port scanning or hitting internal endpoints).
- **Reproduction or Evidence**:
  ```bash
  # Hit test-plex on a fully configured instance
  curl -X POST http://localhost:3000/api/v1/setup/test-plex \
    -H "Content-Type: application/json" \
    -d '{"baseUrl":"http://127.0.0.1:22","token":"dummy-token-long-enough"}'
  ```
- **Expected Behaviour**: Setup-specific endpoints (like test-plex and start/status pin flows) must be inaccessible once the instance is configured, returning a `409 INSTANCE_ALREADY_CONFIGURED` response.
- **Suggested Fix**: Query setup status and reject requests if configured:
  ```typescript
  const existing = await getSetupStatus(database)
  if (existing.configured) {
    return sendProblem(reply, 409, 'INSTANCE_ALREADY_CONFIGURED', 'This Musearr instance has already been configured.')
  }
  ```
- **Verification Status**: Fixed and verified.
- **Whether an existing PR already addresses it**: No.

---

### Issue 2: PowerShell Syntax Corruption in Release Compose File
- **Severity**: Medium
- **Affected Component/Files**: `docker-compose.release.yml`
- **Description**: The `docker-compose.release.yml` file generated in the `development` branch contains literal `` `n `` characters (e.g. `migrate:`n    image: ...`). This syntax prevents Docker Compose from parsing the YAML properly, causing self-hosting deployment failures.
- **Reproduction or Evidence**: Running `docker compose -f docker-compose.release.yml config` yields parsing/indentation errors.
- **Expected Behaviour**: Valid, clean Docker Compose YAML syntax.
- **Suggested Fix**: Clean up the literal `` `n `` strings and format the YAML services properly.
- **Verification Status**: Fixed and verified.
- **Whether an existing PR already addresses it**: Partially addressed in `development` but with a PowerShell bug that introduced the corruption.

---

### Issue 3: Next.js Production Build Failure due to strict TypeScript AbortSignal Type
- **Severity**: Medium
- **Affected Component/Files**: `apps/web/app/_components/sync-recovery-state.tsx`
- **Description**: Under strict TypeScript compiler options (`exactOptionalPropertyTypes: true`), passing `signal` directly as `{ signal }` when it could be `undefined` causes a type assignment mismatch on `RequestInit`.
- **Reproduction or Evidence**: Running `npm run build --workspace=@musearr/web` fails with:
  ```
  error TS2769: No overload matches this call. Argument of type '{ signal: AbortSignal | undefined; }' is not assignable to parameter of type 'RequestInit' with 'exactOptionalPropertyTypes: true'.
  ```
- **Expected Behaviour**: Successful production builds with zero type compiler warnings/errors.
- **Suggested Fix**: Conditionally pass the signal object: `signal ? { signal } : undefined`.
- **Verification Status**: Fixed and verified.
- **Whether an existing PR already addresses it**: No.

---

### Issue 4: Potential Dashboard Crash from Malformed Recommendation JSON Values
- **Severity**: Medium
- **Affected Component/Files**: `packages/db/src/repository.ts`
- **Description**: Stored recommendation run parameters/reasons inside `reason_codes` or `explanation_data` columns are stored as JSON/JSONB. If any malformed or unexpected nested string structures exist, they can cause deserialisation crashes when loading the dashboard.
- **Reproduction or Evidence**: Non-object array payloads or double-nested string JSON payloads from database driver.
- **Expected Behaviour**: Fault-tolerant and robust parsing of recommendation JSON arrays and fields.
- **Suggested Fix**: Add recursive `parseJsonValue` helper and safe parsers in `repository.ts`.
- **Verification Status**: Incorporated and verified.
- **Whether an existing PR already addresses it**: Yes, in `origin/feat/ui-controls-sync-progress`.
