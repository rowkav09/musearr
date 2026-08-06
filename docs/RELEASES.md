# Releases

This guide defines how Musearr versions, publishes, upgrades, and rolls back releases. It supplements [CI and delivery](CI.md) and records the policy for the current `0.1.0` foundation.

## Versioning

Musearr uses [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0/). The canonical application version is the root `package.json` `version` field; a release tag must be `v<version>` and match it exactly.

While Musearr is below `1.0.0`:

- `0.MINOR.0` releases may add features or make incompatible API, configuration, deployment, or data-model changes.
- `0.MINOR.PATCH` releases are for backwards-compatible fixes and documentation or operational corrections within that minor line.
- A `1.0.0` release requires an explicitly reviewed stable compatibility promise; it is not implied by roadmap progress.

Every release updates `CHANGELOG.md` before the tag is created. Release notes call out operator-visible changes, compatibility effects, upgrade steps, and any rollback limits.

## Release tags and images

Create release tags only from a validated `main` commit. Pushing a `v*` tag runs **Publish container images**, which publishes multi-architecture (`linux/amd64` and `linux/arm64`) images for:

- `ghcr.io/rowkav09/musearr-api`
- `ghcr.io/rowkav09/musearr-worker`
- `ghcr.io/rowkav09/musearr-web`
- `ghcr.io/rowkav09/musearr-migrate`

For `v0.1.0`, the publishing workflow produces the exact version tag `0.1.0`, the moving `0.1` and `0` aliases, and a commit-SHA tag. The versioned tag is the human-readable release reference; deployers should pin images by digest when reproducibility matters.

### Immutability policy

- Never move, rebuild, or overwrite an existing `v<version>` Git tag.
- Never republish an existing exact image version with different contents. If a release is faulty, publish a new patch version instead.
- Minor and major image tags (`0.1`, `0`) are convenience aliases and may move. They are not deployment pins.
- Record the image digest used by every production deployment. A digest is the rollback-safe artifact reference.

## Compatibility

A deployment is a release set: API, worker, web, and migrate images must use the same exact release version (or their recorded digests). Do not mix moving aliases with versioned images.

Before a release, document:

1. API, configuration, and environment-variable compatibility.
2. Database migration behavior and whether it is reversible.
3. Any required ordering or maintenance window.
4. The oldest supported prior release for an in-place upgrade, if applicable.

Until `1.0.0`, compatibility within a minor line is the target, not a guarantee across minor lines. Breaking changes must be called out in the changelog and release notes.

## Upgrade

1. Read the target release notes and the matching `CHANGELOG.md` entry.
2. Back up the database and preserve the currently deployed image digests.
3. Pull the API, worker, web, and migrate images for one exact target version or recorded digest.
4. Run the target migrate image once, following any release-specific migration instructions.
5. Deploy the API, worker, and web images as the same release set.
6. Verify health, sync status, and application logs before declaring the upgrade complete.

Do not use `0`, `0.1`, or `latest`-style aliases for a controlled upgrade.

## Rollback

1. Stop or pause new work if the failure could create additional inconsistent state.
2. Redeploy the previously recorded API, worker, and web image digests as one release set.
3. Assess database migrations before running an older migrate image. Do **not** assume migrations are reversible.
4. If the failed release made an incompatible schema or data change, restore the pre-upgrade database backup or follow the release-specific recovery procedure before starting the prior application version.
5. Re-run health and sync verification, then record the incident and the selected recovery path.

A rollback changes the deployment; it never rewrites a release tag or image version.
