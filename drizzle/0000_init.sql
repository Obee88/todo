-- Task 1 initial schema: user, list, list_member, list_item.
-- Applied by scripts/migrate.mjs on container start. Idempotent
-- (CREATE TABLE IF NOT EXISTS / IF NOT EXISTS on indexes) so re-running this
-- file against a DB that already has these tables is a safe no-op — required
-- by PLAN.md Task 1 acceptance criterion: "scripts/migrate.mjs applies
-- 0000_init.sql idempotently before the server starts."
--
-- DECISION: enable pgcrypto for gen_random_uuid() — rationale: schema.ts
-- declares uuid primary keys with defaultRandom(), which Drizzle compiles to
-- `DEFAULT gen_random_uuid()`; that function lives in the pgcrypto extension
-- on Postgres < 13, and is built into core as of Postgres 13+ but only
-- reliably available without the extension on 14+. The platform runs
-- Postgres 16 (per vps/MANAGED_PROJECT_GUIDE.md), where gen_random_uuid() is
-- built-in and CREATE EXTENSION IF NOT EXISTS pgcrypto is a harmless no-op
-- requiring no superuser privileges beyond what's already granted to the
-- per-project role. Alternatives considered: generate UUIDs in application
-- code via crypto.randomUUID() and drop the DB-side default (rejected —
-- schema.ts already commits to defaultRandom(); keeping both in sync matters
-- more than avoiding one extension statement). Reversal cost: low.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "user" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"          text        NOT NULL,
  "password_hash"  text        NOT NULL,
  "name"           text,
  "created_at"     timestamp   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email");

CREATE TABLE IF NOT EXISTS "list" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        text        NOT NULL,
  "owner_id"    uuid        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at"  timestamp   NOT NULL DEFAULT now(),
  "updated_at"  timestamp   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "list_member" (
  "list_id"     uuid        NOT NULL REFERENCES "list"("id") ON DELETE CASCADE,
  "user_id"     uuid        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "invited_by"  uuid        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at"  timestamp   NOT NULL DEFAULT now(),
  PRIMARY KEY ("list_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "list_item" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "list_id"     uuid        NOT NULL REFERENCES "list"("id") ON DELETE CASCADE,
  "title"       text        NOT NULL,
  "done"        boolean     NOT NULL DEFAULT false,
  "position"    integer     NOT NULL,
  "created_at"  timestamp   NOT NULL DEFAULT now(),
  "updated_at"  timestamp   NOT NULL DEFAULT now()
);

-- Supports the sort rule (done ASC, position ASC) and the per-list "next
-- position" lookup (max(position) for a list) without a full table scan.
CREATE INDEX IF NOT EXISTS "list_item_list_id_done_position_idx"
  ON "list_item" ("list_id", "done", "position");
