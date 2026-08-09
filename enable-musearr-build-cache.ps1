$ErrorActionPreference = "Stop"

$repo = Get-Location
$dockerfiles = @(
    "infra/docker/Dockerfile.api",
    "infra/docker/Dockerfile.worker",
    "infra/docker/Dockerfile.migrate",
    "infra/docker/Dockerfile.web"
)

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

foreach ($relativePath in $dockerfiles) {
    $path = Join-Path $repo $relativePath

    if (-not (Test-Path $path)) {
        throw "Missing Dockerfile: $relativePath"
    }

    $content = Get-Content $path -Raw

    if (-not $content.StartsWith("# syntax=docker/dockerfile:1.7")) {
        $content = "# syntax=docker/dockerfile:1.7`n" + $content
    }

    $content = $content.Replace(
        "RUN npm ci",
        "RUN --mount=type=cache,id=musearr-npm,target=/root/.npm,sharing=locked npm ci --prefer-offline --no-audit"
    )

    switch ($relativePath) {
        "infra/docker/Dockerfile.web" {
            $content = $content.Replace(
                "RUN npm run build --workspace=@musearr/web",
                "RUN --mount=type=cache,id=musearr-next,target=/app/apps/web/.next/cache,sharing=locked npm run build --workspace=@musearr/web"
            )
        }
        "infra/docker/Dockerfile.api" {
            $content = $content.Replace(
                "RUN npm run build --workspace=@musearr/api && npm prune --omit=dev",
                "RUN --mount=type=cache,id=musearr-npm,target=/root/.npm,sharing=locked npm run build --workspace=@musearr/api && npm prune --omit=dev"
            )
        }
        "infra/docker/Dockerfile.worker" {
            $content = $content.Replace(
                "RUN npm run build --workspace=@musearr/worker && npm prune --omit=dev",
                "RUN --mount=type=cache,id=musearr-npm,target=/root/.npm,sharing=locked npm run build --workspace=@musearr/worker && npm prune --omit=dev"
            )
        }
        "infra/docker/Dockerfile.migrate" {
            $content = $content.Replace(
                "RUN npm run build --workspace=@musearr/db && npm prune --omit=dev",
                "RUN --mount=type=cache,id=musearr-npm,target=/root/.npm,sharing=locked npm run build --workspace=@musearr/db && npm prune --omit=dev"
            )
        }
    }

    Write-Utf8NoBom -Path $path -Content $content
    Write-Host "Updated $relativePath"
}

Write-Host ""
Write-Host "Build cache changes applied."
Write-Host "Validate with:"
Write-Host "  docker compose build web --progress=plain"
Write-Host "Then repeat the same command; the second build should be much faster."
