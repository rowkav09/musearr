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
set_value MUSEARR_PORT 5530
set_value MUSEARR_WEB_ORIGIN http://localhost:5530
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
