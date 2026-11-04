# syntax=docker/dockerfile:1
# Multi-stage build: compile in a full stage, run as the unprivileged `node` user with only
# production dependencies. Data (PGlite directory and file storage) lives in /data; set
# DATABASE_URL to use PostgreSQL instead of PGlite.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS runtime
# The release id (git sha) is baked into the image so /metrics.json reports it on every
# provider; deploy verification compares it with the commit being released.
ARG RELEASE=dev
ENV RELEASE=$RELEASE \
    NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PGLITE_DIR=/data/pglite \
    STORAGE_DIR=/data/storage \
    FLAGS_FILE=/app/flags/flags.json
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/flags ./flags
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/node/server/main.js"]
