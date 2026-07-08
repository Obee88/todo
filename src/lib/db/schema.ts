// Drizzle schema for the todo app. Matches PLAN.md Section 3 "Data model"
// exactly: user, list, list_member, list_item.
//
// DECISION: define all 4 tables now (Task 1) even though only `/healthz` is
// exercised this task — rationale: PLAN.md Section 4 Task 1 scope explicitly
// lists `schema.ts` as a Task 1 output, and Tasks 2-5 each depend on this
// file already existing (Task 2 depends on `user`, Task 3 on `list`, Task 4
// on `list_item`, Task 5 on `list_member`). Building it once now avoids
// splitting one logical schema across 4 migration files for no reason.
// Alternatives considered: define only `user` now and add the other 3
// tables incrementally in their respective tasks (rejected — PLAN.md's own
// task breakdown for Tasks 3-5 lists "modify schema.ts to add table X" as
// if additive, but the up-front full schema is simpler to keep consistent
// with drizzle/0000_init.sql and avoids repeated `ALTER`/new-migration-file
// churn for a schema that's already fully specified in the plan). Reversal
// cost: low — later tasks simply won't touch schema.ts if it's already
// complete; if a later task needs a genuinely new column, that's a normal
// additive migration regardless of when the table was first declared.
//
// DECISION: use `uuid` Postgres type with `defaultRandom()` for all primary
// keys (matches PLAN.md's literal "uuid pk" column type), rather than the
// dashboard's `text` + `crypto.randomUUID()` pattern — rationale: PLAN.md
// Section 3 data model table states the type explicitly as "uuid", and using
// the native Postgres `uuid` column type lets the DB itself generate and
// validate IDs (`gen_random_uuid()`), which is slightly stronger than
// generating in application code. Alternatives considered: mirror the
// dashboard's `text` + app-generated UUID (rejected — plan spec says `uuid`,
// and this app doesn't need Auth.js adapter compatibility, which was the
// dashboard's reason for using `text`). Reversal cost: medium — changing the
// PK column type after data exists would require a migration touching every
// FK; low risk pre-launch since no data exists yet.

import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Always stored lowercased at the application layer (Task 2 concern);
  // uniqueness is enforced here regardless of who normalizes it.
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const lists = pgTable("list", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const listMembers = pgTable(
  "list_member",
  {
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.listId, t.userId] }),
  })
);

export const listItems = pgTable("list_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id")
    .notNull()
    .references(() => lists.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  // Assigned as an auto-incrementing per-list counter at creation time and
  // never changes afterward — see PLAN.md Section 3 "Sort rule". Sort key
  // only; not a manual-reorder handle (no drag-to-reorder in v1).
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
