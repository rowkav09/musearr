# Continuous integration and delivery

Musearr validates every pull request and push before release work proceeds.

## Required checks

The `CI` workflow runs dependency installation, workspace lint/typecheck, tests, production builds, Docker builds for API/worker/web/migration images, and development/release Docker Compose validation. Concurrent runs for the same ref are cancelled so only the latest commit consumes CI capacity.

Release container publishing remains tag-triggered through `Publish container images`; it publishes `linux/amd64` and `linux/arm64` images.

## Commit message standard

Every pull-request commit must use Conventional Commits:

```text
feat(sync): expose sync run status
fix(web): show actionable sync failure state
docs(ci): explain validation checks
test(api): cover owner-safe sync endpoints
refactor(db): extract sync run serializer
ci(containers): verify Docker builds on pull requests
```

Allowed types are `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci`, `chore`, `perf`, and `style`. Scopes are optional. Already-merged history is preserved; this rule governs new pull-request commits.

## Merge policy

Keep each pull request focused and green. Do not merge with a failing required check. Merge dependent branches in order, inspecting the target branch before each merge. Create release tags only from validated `main` commits.

## Releases

See [Release policy](RELEASES.md) for SemVer rules, immutable tag and image expectations, compatibility, upgrades, and rollbacks.
