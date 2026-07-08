// Drizzle client. Uses `postgres` (postgres-js) as the driver, pointed at
// the per-project Postgres database the platform auto-provisions (see
// vps/MANAGED_PROJECT_GUIDE.md — DATABASE_URL is injected by the platform,
// never set manually, no default).
//
// DECISION: lazy-initialize the db client via a Proxy, same pattern as
// vps/dashboard/src/lib/db/index.ts — rationale: Next.js evaluates the
// module graph at `next build` time (for static analysis / route
// prerendering), and a top-level `throw` on missing DATABASE_URL would break
// `npm run build` in this sandbox (and in any environment building the image
// without DB credentials present, which is exactly the platform's
// build-then-run split: DATABASE_URL only exists at container *runtime*, not
// build time). Alternatives considered: read DATABASE_URL eagerly at module
// load (rejected — fails Task 1's own acceptance criterion "npm run build
// completes with no errors" whenever DATABASE_URL isn't set in the build
// environment, which is the default case in CI/Docker build stages).
// Reversal cost: low, isolated to this file.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
  __db?: DrizzleDb;
};

function getDb(): DrizzleDb {
  if (globalForDb.__db) return globalForDb.__db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required and must be provided by the environment (see vps/MANAGED_PROJECT_GUIDE.md) — no default is set."
    );
  }

  const client = globalForDb.__pg ?? postgres(url, { max: 5, idle_timeout: 30 });
  if (process.env.NODE_ENV !== "production") globalForDb.__pg = client;

  const instance = drizzle(client, { schema });
  if (process.env.NODE_ENV !== "production") globalForDb.__db = instance;
  return instance;
}

// Property accesses on `db` resolve through getDb() — the connection is only
// opened when something actually reads or writes, so importing this module
// (e.g. transitively during `next build`) never requires DATABASE_URL.
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as Function).bind(real) : value;
  },
});

export { schema };
