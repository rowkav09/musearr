$ErrorActionPreference = "Stop"

$repo = Get-Location

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $fullPath = Join-Path $repo $Path
    $directory = Split-Path $fullPath -Parent
    if ($directory -and -not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    [System.IO.File]::WriteAllText(
        $fullPath,
        $Content,
        [System.Text.UTF8Encoding]::new($false)
    )
}

$compose = @'
services:
  bootstrap:
    image: node:24-alpine
    restart: "no"
    environment:
      MUSEARR_ENV_FILE: /workspace/.env
      MUSEARR_SECRETS_DIR: /run/musearr
    volumes:
      - ./:/workspace
      - musearr_config:/run/musearr
      - ./infra/docker/bootstrap-config.sh:/bootstrap-config.sh:ro
    command: ["sh", "/bootstrap-config.sh"]

  db:
    image: postgres:17-alpine
    restart: unless-stopped
    depends_on:
      bootstrap:
        condition: service_completed_successfully
    environment:
      POSTGRES_DB: musearr
      POSTGRES_USER: musearr
      POSTGRES_PASSWORD_FILE: /run/musearr/postgres_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - musearr_config:/run/musearr:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U musearr -d musearr"]
      interval: 5s
      timeout: 5s
      retries: 15
    networks: [app]

  migrate:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.migrate
    volumes:
      - musearr_config:/run/musearr:ro
    command:
      - sh
      - -ec
      - |
        export DATABASE_URL="postgresql://musearr:$(cat /run/musearr/postgres_password)@db:5432/musearr"
        exec node packages/db/dist/migrate.js
    depends_on:
      db:
        condition: service_healthy
    networks: [app]
    restart: "no"

  api:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.api
    restart: unless-stopped
    environment:
      NODE_ENV: production
      MUSEARR_API_HOST: 0.0.0.0
      MUSEARR_API_PORT: 4000
      MUSEARR_WEB_ORIGIN: "http://${MUSEARR_HOST:-localhost}:${MUSEARR_PORT:-3000}"
      MUSEARR_TRUST_PROXY: "true"
      MUSEARR_PLEX_WEBHOOK_SECRET: ${MUSEARR_PLEX_WEBHOOK_SECRET:-}
    volumes:
      - musearr_config:/run/musearr:ro
    command:
      - sh
      - -ec
      - |
        export DATABASE_URL="postgresql://musearr:$(cat /run/musearr/postgres_password)@db:5432/musearr"
        export MUSEARR_ENCRYPTION_KEY="$(cat /run/musearr/encryption_key)"
        export MUSEARR_SESSION_SECRET="$(cat /run/musearr/session_secret)"
        exec node apps/api/dist/index.js
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks: [app]

  worker:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.worker
    restart: unless-stopped
    environment:
      NODE_ENV: production
      MUSEARR_RECONCILIATION_INTERVAL_MINUTES: ${MUSEARR_RECONCILIATION_INTERVAL_MINUTES:-360}
      MUSEARR_TIMEZONE: ${MUSEARR_TIMEZONE:-UTC}
      MUSEARR_DAILY_BRIEF_TIME: ${MUSEARR_DAILY_BRIEF_TIME:-08:00}
      MUSEARR_DISCORD_WEBHOOK_URL: ${MUSEARR_DISCORD_WEBHOOK_URL:-}
    volumes:
      - musearr_config:/run/musearr:ro
    command:
      - sh
      - -ec
      - |
        export DATABASE_URL="postgresql://musearr:$(cat /run/musearr/postgres_password)@db:5432/musearr"
        export MUSEARR_ENCRYPTION_KEY="$(cat /run/musearr/encryption_key)"
        exec node apps/worker/dist/index.js
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks: [app]

  web:
    healthcheck:
      test:
        - CMD
        - wget
        - -q
        - --spider
        - http://127.0.0.1:3000/api/health
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.web
      args:
        MUSEARR_API_URL: http://api:4000
    restart: unless-stopped
    environment:
      MUSEARR_API_URL: http://api:4000
    depends_on:
      api:
        condition: service_healthy
    networks: [app, edge]

  caddy:
    image: caddy:2.10-alpine
    restart: unless-stopped
    ports:
      - "${MUSEARR_PORT:-3000}:80"
    volumes:
      - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      web:
        condition: service_healthy
    networks: [edge]

networks:
  app:
    internal: true
  edge:

volumes:
  postgres_data:
  caddy_data:
  caddy_config:
  musearr_config:
'@

$release = $compose `
    -replace '(?ms)  migrate:\r?\n    build:\r?\n      context: \.\r?\n      dockerfile: infra/docker/Dockerfile\.migrate', '  migrate:`n    image: ${MUSEARR_IMAGE_REPOSITORY:-ghcr.io/rowkav09}/musearr-migrate:${MUSEARR_IMAGE_VERSION:?Set MUSEARR_IMAGE_VERSION in .env}' `
    -replace '(?ms)  api:\r?\n    build:\r?\n      context: \.\r?\n      dockerfile: infra/docker/Dockerfile\.api', '  api:`n    image: ${MUSEARR_IMAGE_REPOSITORY:-ghcr.io/rowkav09}/musearr-api:${MUSEARR_IMAGE_VERSION:?Set MUSEARR_IMAGE_VERSION in .env}' `
    -replace '(?ms)  worker:\r?\n    build:\r?\n      context: \.\r?\n      dockerfile: infra/docker/Dockerfile\.worker', '  worker:`n    image: ${MUSEARR_IMAGE_REPOSITORY:-ghcr.io/rowkav09}/musearr-worker:${MUSEARR_IMAGE_VERSION:?Set MUSEARR_IMAGE_VERSION in .env}' `
    -replace '(?ms)  web:\r?\n    healthcheck:', '  web:`n    image: ${MUSEARR_IMAGE_REPOSITORY:-ghcr.io/rowkav09}/musearr-web:${MUSEARR_IMAGE_VERSION:?Set MUSEARR_IMAGE_VERSION in .env}`n    healthcheck:' `
    -replace '(?ms)    build:\r?\n      context: \.\r?\n      dockerfile: infra/docker/Dockerfile\.web\r?\n      args:\r?\n        MUSEARR_API_URL: http://api:4000\r?\n', ''

$envExample = @'
# Docker Compose creates .env and secure secrets automatically on first start.
# These values are optional overrides for local self-hosting.
MUSEARR_HOST=localhost
MUSEARR_PORT=3000
MUSEARR_WEB_ORIGIN=http://localhost:3000

# Local Node.js development only. Docker Compose supplies its own internal URL.
DATABASE_URL=postgresql://musearr:musearr@localhost:5432/musearr
MUSEARR_API_HOST=0.0.0.0
MUSEARR_API_PORT=4000
MUSEARR_TRUST_PROXY=false
MUSEARR_RECONCILIATION_INTERVAL_MINUTES=360
MUSEARR_TIMEZONE=UTC
MUSEARR_DAILY_BRIEF_TIME=08:00

# MUSEARR_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/replace-with-id/replace-with-token
# MUSEARR_PLEX_WEBHOOK_SECRET=replace-with-a-long-random-value

MUSEARR_API_URL=http://localhost:4000

# Release compose only.
# MUSEARR_IMAGE_VERSION=0.1.0
# MUSEARR_IMAGE_REPOSITORY=ghcr.io/rowkav09
'@

$bootstrap = @'
#!/bin/sh
set -eu

umask 077

ENV_FILE="${MUSEARR_ENV_FILE:-/workspace/.env}"
SECRETS_DIR="${MUSEARR_SECRETS_DIR:-/run/musearr}"

mkdir -p "$(dirname "$ENV_FILE")" "$SECRETS_DIR"
touch "$ENV_FILE"

read_value() {
  key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1
}

set_value() {
  key="$1"
  value="$2"

  if grep -q "^${key}=" "$ENV_FILE"; then
    current="$(read_value "$key")"
    case "$current" in
      ""|replace-*|change-me|musearr)
        sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        ;;
    esac
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

generate_base64() {
  node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
}

generate_hex() {
  node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
}

set_value MUSEARR_HOST localhost
set_value MUSEARR_PORT 3000
set_value MUSEARR_WEB_ORIGIN http://localhost:3000
set_value POSTGRES_PASSWORD "$(generate_hex)"
set_value MUSEARR_ENCRYPTION_KEY "$(generate_base64)"
set_value MUSEARR_SESSION_SECRET "$(generate_base64)"
set_value MUSEARR_TIMEZONE UTC
set_value MUSEARR_DAILY_BRIEF_TIME 08:00
set_value MUSEARR_RECONCILIATION_INTERVAL_MINUTES 360

POSTGRES_PASSWORD="$(read_value POSTGRES_PASSWORD)"
MUSEARR_ENCRYPTION_KEY="$(read_value MUSEARR_ENCRYPTION_KEY)"
MUSEARR_SESSION_SECRET="$(read_value MUSEARR_SESSION_SECRET)"

[ -n "$POSTGRES_PASSWORD" ] || { echo "POSTGRES_PASSWORD was not generated." >&2; exit 1; }
[ -n "$MUSEARR_ENCRYPTION_KEY" ] || { echo "MUSEARR_ENCRYPTION_KEY was not generated." >&2; exit 1; }
[ -n "$MUSEARR_SESSION_SECRET" ] || { echo "MUSEARR_SESSION_SECRET was not generated." >&2; exit 1; }

printf '%s' "$POSTGRES_PASSWORD" > "$SECRETS_DIR/postgres_password"
printf '%s' "$MUSEARR_ENCRYPTION_KEY" > "$SECRETS_DIR/encryption_key"
printf '%s' "$MUSEARR_SESSION_SECRET" > "$SECRETS_DIR/session_secret"

chmod 0444 \
  "$SECRETS_DIR/postgres_password" \
  "$SECRETS_DIR/encryption_key" \
  "$SECRETS_DIR/session_secret"

echo "Musearr configuration is ready."
'@

$dockerfileWebPath = Join-Path $repo "infra/docker/Dockerfile.web"
$dockerfileWeb = Get-Content $dockerfileWebPath -Raw
$dockerfileWeb = $dockerfileWeb.Replace(
    "http://localhost:3000/api/health",
    "http://127.0.0.1:3000/api/health"
)

Write-Utf8NoBom "docker-compose.yml" $compose
Write-Utf8NoBom "docker-compose.release.yml" $release
Write-Utf8NoBom ".env.example" $envExample
Write-Utf8NoBom "infra/docker/bootstrap-config.sh" $bootstrap
Write-Utf8NoBom "infra/docker/Dockerfile.web" $dockerfileWeb

Write-Host ""
Write-Host "Files updated."
Write-Host "Now run:"
Write-Host "  docker compose config --quiet"
Write-Host "  git status"
