# Single "arr-style" image for Musearr: one container runs Postgres, the
# Fastify API, the background worker, the Next.js dashboard, and a Caddy
# reverse proxy, supervised by supervisord. This is an alternative to the
# 6-container docker-compose.yml stack -- it is not a replacement for it.
# Persistent data (the Postgres cluster) lives under /config, so it can be
# deployed as a single named volume, independent of any other stack.

FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/intelligence/package.json packages/intelligence/package.json
COPY packages/plex/package.json packages/plex/package.json
RUN npm ci

FROM dependencies AS build
ARG MUSEARR_API_URL=http://127.0.0.1:4000
ENV MUSEARR_API_URL=$MUSEARR_API_URL
COPY . .
RUN npm run build --workspace=@musearr/api \
 && npm run build --workspace=@musearr/worker \
 && npm run build --workspace=@musearr/db \
 && npm run build --workspace=@musearr/web \
 && npm prune --omit=dev

FROM node:24-alpine AS runner
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Musearr" \
      org.opencontainers.image.description="Musearr single arr-style image" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION

# postgresql16-contrib provides pgcrypto (gen_random_uuid()), which the
# 0000_foundation migration requires.
RUN apk add --no-cache \
      postgresql16 \
      postgresql16-client \
      postgresql16-contrib \
      caddy \
      supervisor \
      su-exec \
      tzdata \
      curl \
 && for bin in postgres initdb pg_ctl pg_isready psql createdb caddy supervisord; do \
      command -v "$bin" >/dev/null || { echo "missing required binary: $bin" >&2; exit 1; }; \
    done

RUN addgroup --system --gid 1001 musearr && adduser --system --uid 1001 --ingroup musearr musearr

WORKDIR /app
ENV NODE_ENV=production \
    MUSEARR_API_HOST=0.0.0.0 \
    MUSEARR_API_PORT=4000 \
    PORT=3000 \
    HOSTNAME=127.0.0.1

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/migrations ./packages/db/migrations
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

COPY infra/docker/arr/supervisord.conf /etc/musearr/supervisord.conf
COPY infra/docker/arr/Caddyfile /etc/musearr/Caddyfile
COPY infra/docker/arr/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY infra/docker/arr/migrate.sh infra/docker/arr/init-db.sh infra/docker/arr/wait-and-exec.sh /usr/local/bin/musearr/
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/musearr/*.sh \
 && mkdir -p /config/postgres /run/postgresql /run/musearr \
 && chown -R musearr:musearr /run/musearr

VOLUME ["/config"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/ -o /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]