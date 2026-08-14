#!/bin/sh
# Idempotently ensures the app role/database exist and the role's password
# matches the current MUSEARR_DB_PASSWORD (so changing the env var and
# restarting the container doesn't lock the app out of its own database).
# Connects over the local Unix socket, which is configured trust-auth-only
# for local connections (see entrypoint.sh) -- never reachable from outside
# the container.
set -eu

: "${MUSEARR_DB_NAME:=musearr}"
: "${MUSEARR_DB_USER:=musearr}"
: "${MUSEARR_DB_PASSWORD:=musearr}"

PSQL="psql -h /run/postgresql -U postgres -v ON_ERROR_STOP=1"

role_exists=$($PSQL -tAc "SELECT 1 FROM pg_roles WHERE rolname='${MUSEARR_DB_USER}'")
if [ "$role_exists" != "1" ]; then
  echo "musearr: creating database role ${MUSEARR_DB_USER}..."
  $PSQL -c "CREATE ROLE \"${MUSEARR_DB_USER}\" WITH LOGIN PASSWORD '${MUSEARR_DB_PASSWORD}'"
else
  $PSQL -c "ALTER ROLE \"${MUSEARR_DB_USER}\" WITH PASSWORD '${MUSEARR_DB_PASSWORD}'"
fi

db_exists=$($PSQL -tAc "SELECT 1 FROM pg_database WHERE datname='${MUSEARR_DB_NAME}'")
if [ "$db_exists" != "1" ]; then
  echo "musearr: creating database ${MUSEARR_DB_NAME}..."
  createdb -h /run/postgresql -U postgres -O "${MUSEARR_DB_USER}" "${MUSEARR_DB_NAME}"
fi