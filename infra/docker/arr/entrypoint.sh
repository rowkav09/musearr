#!/bin/sh
# Bootstraps the Postgres data directory (first run only), then hands off to
# supervisord, which owns postgres/migrate/api/worker/web/caddy for the rest
# of the container's life. Runs as root so it can chown /config and drop to
# the postgres user for initdb; every long-lived program supervisord starts
# runs as an unprivileged user (see supervisord.conf).
set -eu

: "${MUSEARR_DB_NAME:=musearr}"
: "${MUSEARR_DB_USER:=musearr}"
: "${MUSEARR_DB_PASSWORD:=musearr}"
: "${DATABASE_URL:=postgresql://${MUSEARR_DB_USER}:${MUSEARR_DB_PASSWORD}@127.0.0.1:5432/${MUSEARR_DB_NAME}}"
: "${MUSEARR_TRUST_PROXY:=true}"

export DATABASE_URL MUSEARR_TRUST_PROXY MUSEARR_DB_NAME MUSEARR_DB_USER MUSEARR_DB_PASSWORD

if [ -z "${MUSEARR_ENCRYPTION_KEY:-}" ] || [ -z "${MUSEARR_SESSION_SECRET:-}" ]; then
  cat >&2 <<'EOF'
musearr: MUSEARR_ENCRYPTION_KEY and MUSEARR_SESSION_SECRET are required.
Generate unique 32-byte values, e.g.:
  node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
and pass them with -e/--env-file. See .env.arr.example.
EOF
  exit 1
fi

if [ -z "${MUSEARR_WEB_ORIGIN:-}" ]; then
  echo "musearr: MUSEARR_WEB_ORIGIN is not set; defaulting to http://localhost:3000 (set it to the URL you'll actually use)." >&2
fi

PGDATA_DIR=/config/postgres/data
mkdir -p "$PGDATA_DIR" /run/postgresql /run/musearr
chown -R postgres:postgres /config/postgres /run/postgresql
chown -R musearr:musearr /run/musearr
rm -f /run/musearr/migrate.done

if [ ! -s "$PGDATA_DIR/PG_VERSION" ]; then
  echo "musearr: initialising PostgreSQL data directory at $PGDATA_DIR ..."
  su-exec postgres initdb -D "$PGDATA_DIR" -U postgres --auth-local=trust --auth-host=scram-sha-256 >/dev/null
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "unix_socket_directories = '/run/postgresql'"
  } >> "$PGDATA_DIR/postgresql.conf"
fi

echo "musearr: starting supervisord (postgres, migrate, api, worker, web, caddy)..."
exec supervisord -c /etc/musearr/supervisord.conf