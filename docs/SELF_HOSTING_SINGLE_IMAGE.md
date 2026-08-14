# Self-hosting: single-image ("arr-style") deployment

This is an alternative packaging of Musearr: one container instead of the
six defined in `docker-compose.yml` (db, migrate, api, worker, web, caddy).
`infra/docker/Dockerfile.arr` builds a single image that bundles Postgres,
the API, the worker, the dashboard, and a Caddy reverse proxy, supervised
internally by `supervisord`. It's meant to run independently of any other
Musearr stack you already have -- its own image, its own container, its own
named volume -- so it won't touch other running containers.

## Running it

```sh
cp .env.arr.example .env.arr
# edit .env.arr: set MUSEARR_ENCRYPTION_KEY, MUSEARR_SESSION_SECRET,
# MUSEARR_WEB_ORIGIN, and MUSEARR_ARR_PORT if 8600 is taken.

docker compose -p musearr-arr -f docker-compose.arr.yml up --build -d
```

The `-p musearr-arr` project name keeps this stack's containers, network,
and volume separate from anything named plain `musearr`. Open
`http://localhost:8600` (or your chosen `MUSEARR_ARR_PORT`) and complete
setup, same as the regular stack.

To stop it without affecting anything else:

```sh
docker compose -p musearr-arr -f docker-compose.arr.yml down
```

Data persists in the `musearr_arr_data` named volume; `down -v` removes it.

## Configuration

Same environment variables as the regular stack apply, plus:

- `MUSEARR_ARR_PORT` -- host port to publish (container listens on `8080`
  internally). Defaults to `8600`.
- `MUSEARR_DB_NAME` / `MUSEARR_DB_USER` / `MUSEARR_DB_PASSWORD` -- the
  bundled Postgres database's role/db/password, default `musearr` for all
  three. Changing `MUSEARR_DB_PASSWORD` and restarting re-syncs the role's
  password automatically.
- `DATABASE_URL` -- set this yourself only if you want an external
  Postgres instead of the bundled one.

## Known limitations

- Single container means no independent restart of individual services.
- Back up the `musearr_arr_data` volume (or `pg_dump` inside the
  container) before upgrades -- same responsibility as the compose stack.
- This packaging hasn't been through the project's CI/release process yet;
  treat it as a convenience option, not the primary supported path.