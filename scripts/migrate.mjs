#!/usr/bin/env node
// Runtime migration runner. Plain Node ESM so it can run in the Next.js
// standalone runner image without any build step.
//
// Behavior:
//   1. Ensures a `__migrations` ledger table exists in the app's DB.
//   2. Applies every `.sql` file in /app/drizzle/ (sorted lexicographically)
//      that isn't already recorded in the ledger. Each file runs in its own
//      transaction; the file is recorded only if the SQL succeeded.
//
// Invoked from the Dockerfile CMD: `node scripts/migrate.mjs && node server.js`.
// Per PLAN.md Task 1 acceptance criterion, this must apply 0000_init.sql
// idempotently before the server starts — the ledger table plus the SQL
// file's own `IF NOT EXISTS` guards both contribute to that idempotency
// (the ledger skips re-running a file at all; the SQL guards make even a
// from-scratch re-run against an existing schema a safe no-op).
//
// DECISION: omit the dashboard's "seed first admin" step — rationale: this
// app has open self-service registration (PLAN.md Section 3, `/register`
// route), unlike the dashboard which is a single-operator admin tool with no
// public signup. There's no equivalent bootstrap need. Alternatives
// considered: keep a seed hook for symmetry with the dashboard (rejected —
// YAGNI, nothing in the spec calls for a seeded account). Reversal cost: low.

import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ?? join(__dirname, "..", "drizzle");

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[migrate] DATABASE_URL not set — aborting.");
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });

async function applyMigrations() {
  await sql`
    CREATE TABLE IF NOT EXISTS "__migrations" (
      "id"         text         PRIMARY KEY,
      "applied_at" timestamptz  NOT NULL DEFAULT now()
    )
  `;

  let files;
  try {
    files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.warn(`[migrate] migrations dir not found: ${MIGRATIONS_DIR}`);
      return;
    }
    throw err;
  }

  for (const file of files) {
    const [{ exists }] = await sql`
      SELECT EXISTS(SELECT 1 FROM "__migrations" WHERE id = ${file}) AS exists
    `;
    if (exists) {
      console.log(`[migrate] skip   ${file}`);
      continue;
    }
    console.log(`[migrate] apply  ${file}`);
    const body = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO "__migrations" (id) VALUES (${file})`;
    });
  }
}

try {
  await applyMigrations();
  console.log("[migrate] done.");
} catch (err) {
  console.error("[migrate] failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
