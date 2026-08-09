$ErrorActionPreference = "Stop"

$repo = Get-Location

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    [System.IO.File]::WriteAllText(
        $Path,
        $Content,
        [System.Text.UTF8Encoding]::new($false)
    )
}

# 1. Fix Caddy networking in both Compose files.
$composeFiles = @(
    "docker-compose.yml",
    "docker-compose.release.yml"
)

foreach ($relativePath in $composeFiles) {
    $path = Join-Path $repo $relativePath

    if (-not (Test-Path $path)) {
        throw "Missing Compose file: $relativePath"
    }

    $content = Get-Content $path -Raw

    # Restrict replacement to the caddy service block.
    $pattern = '(?ms)(  caddy:\r?\n.*?    networks:) \[edge\]'
    if ($content -notmatch $pattern) {
        if ($content -match '(?ms)  caddy:\r?\n.*?    networks: \[app, edge\]') {
            Write-Host "$relativePath already has the Caddy network fix."
        }
        else {
            throw "Could not find Caddy networks entry in $relativePath"
        }
    }
    else {
        $content = [regex]::Replace($content, $pattern, '$1 [app, edge]', 1)
        Write-Utf8NoBom -Path $path -Content $content
        Write-Host "Updated Caddy networks in $relativePath"
    }
}

# 2. Optimise backend Docker builds.
$backendDockerfiles = @(
    @{ Path = "infra/docker/Dockerfile.api"; Workspace = "@musearr/api" },
    @{ Path = "infra/docker/Dockerfile.worker"; Workspace = "@musearr/worker" },
    @{ Path = "infra/docker/Dockerfile.migrate"; Workspace = "@musearr/db" }
)

foreach ($entry in $backendDockerfiles) {
    $path = Join-Path $repo $entry.Path

    if (-not (Test-Path $path)) {
        throw "Missing Dockerfile: $($entry.Path)"
    }

    $content = Get-Content $path -Raw

    # Keep the npm cache only for npm ci.
    $content = [regex]::Replace(
        $content,
        'RUN --mount=type=cache,id=musearr-npm,target=/root/\.npm,sharing=locked npm ci --prefer-offline --no-audit(?: --no-fund)?',
        'RUN --mount=type=cache,id=musearr-npm,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund'
    )

    # Remove the shared locked mount from build/prune to stop serialising images.
    $workspace = [regex]::Escape($entry.Workspace)
    $content = [regex]::Replace(
        $content,
        "RUN --mount=type=cache,id=musearr-npm,target=/root/\.npm,sharing=locked npm run build --workspace=$workspace && npm prune --omit=dev(?: --no-audit --no-fund)?",
        "RUN npm run build --workspace=$($entry.Workspace) && npm prune --omit=dev --no-audit --no-fund"
    )

    # Also normalise already partly edited variants.
    $content = $content.Replace(
        "npm prune --omit=dev",
        "npm prune --omit=dev --no-audit --no-fund"
    )
    $content = $content.Replace(
        "--no-audit --no-fund --no-audit --no-fund",
        "--no-audit --no-fund"
    )

    Write-Utf8NoBom -Path $path -Content $content
    Write-Host "Optimised $($entry.Path)"
}

# 3. Keep the web caches, but remove the unnecessary global lock.
$webPath = Join-Path $repo "infra/docker/Dockerfile.web"
if (-not (Test-Path $webPath)) {
    throw "Missing Dockerfile: infra/docker/Dockerfile.web"
}

$web = Get-Content $webPath -Raw
$web = $web.Replace(
    "RUN --mount=type=cache,id=musearr-npm,target=/root/.npm,sharing=locked npm ci --prefer-offline --no-audit",
    "RUN --mount=type=cache,id=musearr-npm,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund"
)
$web = $web.Replace(
    "RUN --mount=type=cache,id=musearr-next,target=/app/apps/web/.next/cache,sharing=locked npm run build --workspace=@musearr/web",
    "RUN --mount=type=cache,id=musearr-next,target=/app/apps/web/.next/cache npm run build --workspace=@musearr/web"
)
Write-Utf8NoBom -Path $webPath -Content $web
Write-Host "Optimised infra/docker/Dockerfile.web"

Write-Host ""
Write-Host "Done."
Write-Host "Run:"
Write-Host "  docker compose config --quiet"
Write-Host "  docker compose up -d --no-build --force-recreate caddy"
Write-Host "  Invoke-WebRequest http://localhost:3000/api/v1/setup/status"
Write-Host "  git diff --stat"
