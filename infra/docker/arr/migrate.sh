#!/bin/sh
# supervisord [program:migrate]: waits for Postgres, ensures the app
# role/database exist, runs the forward-only migrations, then drops a
# sentinel file that api/worker/web/caddy all block on before starting.
# Exits 0 on success (autorestart=false -- a one-shot, not a daemon).
set -eu

echo "musearr: waiting for postgres to accept connections..."
i=0
until pg_isready -h 127.0.0.1 -p 5432 -U "${MUSEARR_DB_USER:-musearr}" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "musearr: postgres did not become ready within 60s" >&2
    exit 1
  fi
  sleep 1
done

/usr/local/bin/musearr/init-db.sh

echo "musearr: running database migrations..."
cd /app
node packages/db/dist/migrate.js

mkdir -p /run/musearr
touch /run/musearr/migrate.done
echo "musearr: migrations complete."