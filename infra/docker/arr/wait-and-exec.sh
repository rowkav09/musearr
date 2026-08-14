#!/bin/sh
# Blocks until a sentinel file exists, then execs the given command in its
# place -- used so api/worker/web/caddy all wait for [program:migrate] to
# finish before starting, without giving supervisord a native "depends_on".
# `exec` matters here: it replaces this wrapper with the real process so
# supervisord's stop signal reaches node/caddy directly.
set -eu

sentinel="$1"
shift

i=0
while [ ! -f "$sentinel" ]; do
  i=$((i + 1))
  if [ "$i" -gt 300 ]; then
    echo "musearr: timed out waiting for $sentinel" >&2
    exit 1
  fi
  sleep 1
done

exec "$@"