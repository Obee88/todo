# syntax=docker/dockerfile:1.7

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# DECISION: non-root user via addgroup/adduser, matching
# vps/MANAGED_PROJECT_GUIDE.md's "final stage should run as a non-root user"
# requirement and the dashboard's proven pattern. Alternatives considered:
# Alpine's built-in `node` user (rejected only for consistency with the
# dashboard's explicit uid/gid — no functional difference). Reversal cost: low.
RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nextjs

# Standalone output ships a minimal server.js + only the node_modules
# subpaths Next.js's file tracer determined were reachable (plus the
# next.config.ts outputFileTracingIncludes additions for the migration
# runner's deps).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migration runner + SQL migrations. These live outside the Next.js app graph
# so the tracer doesn't know about them — copy them in explicitly
# (belt-and-suspenders alongside next.config.ts's outputFileTracingIncludes).
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000

# DECISION: HEALTHCHECK uses `wget` (always present on Alpine) via CMD-SHELL
# (`sh -c` implicitly, since no explicit shell form is used), not `bash` —
# per vps/MANAGED_PROJECT_GUIDE.md pitfall #6 ("many minimal images ship only
# /bin/sh, not bash"). --start-period=30s per pitfall #6's guidance that
# Next.js needs >= 30s to boot before failed probes count against the retry
# limit. Port 3000 matches EXPOSE and the app's PORT env — per pitfall #7,
# this must be the container-internal port, not any host-side -p mapping.
HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=30s \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

# On container start: apply any pending migrations (idempotent — no-op if
# nothing pending), then start Next.js. If migration fails the container
# exits non-zero and Docker restarts it, which is the behavior we want.
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
