import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle in .next/standalone — small
  // image, no devDeps in prod. Required by the platform's Dockerfile shape
  // (see vps/MANAGED_PROJECT_GUIDE.md and Dockerfile in this project).
  output: "standalone",
  // DECISION: force-include the runtime migration runner + its SQL files and
  // the node_modules packages they need — rationale: scripts/migrate.mjs
  // lives outside the Next.js route graph, so Next's file-tracer can't see
  // it and would omit `postgres`/`bcryptjs`/`drizzle-orm` from the
  // standalone output since no route imports them at build-analysis time in
  // this task (schema.ts is defined but not yet queried from a route beyond
  // db/index.ts's lazy client). Alternatives considered: rely solely on the
  // Dockerfile's explicit COPY of scripts/ and drizzle/ (insufficient alone
  // because the *node_modules subset* the standalone build ships is
  // determined by tracing, not by copying source files) — belt-and-suspenders
  // with the Dockerfile COPY is intentional, matching the dashboard's proven
  // pattern. Reversal cost: low, this is additive config.
  outputFileTracingIncludes: {
    "/": [
      "./scripts/**/*",
      "./drizzle/**/*",
      "./node_modules/postgres/**/*",
      "./node_modules/bcryptjs/**/*",
      "./node_modules/drizzle-orm/**/*",
    ],
  },
};

export default nextConfig;
