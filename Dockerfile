# FC OS production image, built by Coolify on the box (Dockerfile build pack).
#
# Bun installs + runs `next build`; the runtime is plain Node serving the
# `output: "standalone"` bundle. Debian (glibc) for every stage so the `sharp`
# binary used by next/image matches the runtime. The build needs no network
# beyond package install (fonts are vendored via next/font/local) and no DB.

FROM oven/bun:1.3.6 AS bun

FROM node:22-slim AS deps
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# src/database/db.ts and src/lib/auth/server.ts throw at import without these, and
# `next build` imports route modules. Placeholders only: postgres-js connects
# lazily, so nothing is dialed, and they never reach the runtime stage. Real
# values are Coolify runtime env vars.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:1/build \
    BETTER_AUTH_SECRET=build-time-placeholder-never-used-at-runtime \
    bun run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
# The slim image has no curl/wget (and apt over :80 is unreliable on campus), so
# probe with Node's fetch. `/` answers 307 to /login when healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/',{redirect:'manual'}).then(r=>process.exit(r.status<400?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
