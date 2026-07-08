import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Given/When/Then coverage for PLAN.md Task 1 acceptance criterion:
// "Given a local Postgres and DATABASE_URL set, when the container starts,
// then scripts/migrate.mjs applies 0000_init.sql idempotently before the
// server starts."
//
// We can't run a live Postgres in this sandbox (no docker/psql binary), so
// this test statically verifies the idempotency contract of the SQL file
// itself: every DDL statement that creates a table or index must guard with
// IF NOT EXISTS, so re-running the file against a DB that already has the
// schema is a safe no-op. (scripts/migrate.mjs additionally guards via the
// __migrations ledger table — that runtime behavior is not exercised here,
// only the SQL file's own idempotency.)
const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "..", "drizzle", "0000_init.sql");
const sql = readFileSync(sqlPath, "utf8");

describe("drizzle/0000_init.sql idempotency", () => {
  it("given the migration file, when CREATE TABLE statements are found, then every one uses IF NOT EXISTS", () => {
    const createTableStatements = sql.match(/CREATE TABLE\s+(?!IF NOT EXISTS)\S/gi) ?? [];
    expect(createTableStatements).toEqual([]);
  });

  it("given the migration file, when CREATE INDEX statements are found, then every one uses IF NOT EXISTS", () => {
    const createIndexStatements =
      sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)\S/gi) ?? [];
    expect(createIndexStatements).toEqual([]);
  });

  it("given the migration file, when CREATE EXTENSION statements are found, then every one uses IF NOT EXISTS", () => {
    const createExtensionStatements =
      sql.match(/CREATE EXTENSION\s+(?!IF NOT EXISTS)\S/gi) ?? [];
    expect(createExtensionStatements).toEqual([]);
  });

  it("given the migration file, when inspected, then it defines all four PLAN.md tables (user, list, list_member, list_item)", () => {
    for (const table of ["user", "list", "list_member", "list_item"]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
    }
  });
});
