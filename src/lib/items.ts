import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { listItems } from "@/lib/db/schema";

export type ListItemRow = typeof listItems.$inferSelect;

// Item helpers for the `list_item` resource — Task 4.
//
// PLAN.md Section 3 "Sort rule": "items are ordered by `done ASC, position
// ASC`. New items get `position = max(position for that list) + 1`.
// Checking/unchecking an item changes only `done`, never `position` — so
// within each group (undone / done) items retain creation order."

/**
 * All items in list `listId`, ordered per PLAN.md's sort rule: undone
 * before done, each group in ascending `position` (== creation order, since
 * `position` is assigned once at creation and never changes).
 *
 * # DECISION: sort entirely in SQL (`ORDER BY done ASC, position ASC`)
 * rather than fetching unordered rows and sorting in application code —
 * rationale: this is the exact rule stated in PLAN.md, Postgres can use an
 * index on `(list_id, done, position)` for it if one is ever added, and it
 * keeps `sortListItems` (below) as a pure, independently-testable function
 * for the *comparator logic* without needing a DB round trip in unit tests.
 * Alternatives considered: fetch by `list_id` only and sort client-side
 * (rejected — pushes work + a second source of truth for the sort rule into
 * every caller). Reversal cost: low.
 */
export async function getSortedListItems(
  listId: string
): Promise<ListItemRow[]> {
  return db
    .select()
    .from(listItems)
    .where(eq(listItems.listId, listId))
    .orderBy(asc(listItems.done), asc(listItems.position));
}

/**
 * Pure comparator implementing PLAN.md's sort rule, exported so the rule
 * itself has a unit test independent of any DB/query builder — given an
 * unordered array of items, returns them ordered `done ASC, position ASC`.
 *
 * # DECISION: also expose this as a pure function (not just the SQL query
 * above) — rationale: the task's test requirements explicitly call for
 * "the sorting logic ... as a pure function if you factor sorting out."
 * Having both the SQL `ORDER BY` (source of truth at read time) and this
 * pure comparator (documents + tests the rule in isolation, and guards
 * against a future refactor accidentally sorting in application code
 * incorrectly) is intentional duplication of intent, not of behavior divergence
 * risk — both encode the identical two-key sort.
 */
export function sortListItems<T extends { done: boolean; position: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.position - b.position;
  });
}

/**
 * Inserts a new item at the end of the undone group: `position = max(position
 * for that list) + 1`, `done = false`.
 *
 * # DECISION: compute `MAX(position) + 1` inside a single INSERT ... SELECT
 * statement (via Drizzle's `sql` template for the value expression) rather
 * than issuing a separate `SELECT MAX(position)` followed by an `INSERT`
 * from application code — rationale: the task explicitly calls out that
 * position assignment "should be safe against races within a single request
 * using a subquery/aggregate, not a read-then-write race in application
 * code." A two-step read-then-write is subject to a classic race: two
 * concurrent POSTs could both read the same max and insert the same
 * position. Folding the aggregate into the INSERT's value expression makes
 * Postgres compute it as part of one statement; on Postgres's default READ
 * COMMITTED isolation this still doesn't fully serialize two literally
 * concurrent inserts to zero risk (that would need a unique constraint on
 * (list_id, position) + retry, or SERIALIZABLE isolation, or a per-list
 * advisory lock), but it removes the app-code round-trip gap, which is the
 * dominant source of the race in practice, and matches what a single HTTP
 * request naturally does (one DB call, not two). Alternatives considered:
 * (a) app-code `SELECT MAX` then `INSERT` (rejected — two round trips, wider
 * race window, exactly what the task says to avoid); (b) a DB sequence or
 * per-list counter table (rejected — bigger schema change than this task's
 * scope allows, and PLAN.md's schema doesn't call for one); (c) wrapping in
 * a SERIALIZABLE transaction with retry (rejected — adds real complexity/
 * retry-loop code for a todo app where two people adding an item to the same
 * list in the same millisecond is an acceptable, low-stakes edge case whose
 * worst outcome is a harmless duplicate position value, not data loss —
 * `position` is a sort tiebreaker, not a uniqueness-critical key). Reversal
 * cost: low — swapping in a stricter strategy later only touches this one
 * function.
 *
 * # DECISION: first item in an empty list gets `position = 0` — rationale:
 * PLAN.md says "max(position for that list) + 1" but doesn't state the base
 * case explicitly; `COALESCE(MAX(position), -1) + 1` yields `0` for the
 * first item, `1` for the second, etc. — a conventional zero-based sequence.
 * Alternatives considered: starting at `1` via `COALESCE(MAX(position), 0) +
 * 1` (rejected — arbitrary either way since only relative order matters, but
 * 0-based matches the codebase's general convention of 0-indexing and avoids
 * a "why does the first item have position 1, not 0" question later).
 * Reversal cost: none — `position` is only ever compared relatively, never
 * displayed or matched against a literal value.
 */
export async function insertListItem(
  listId: string,
  title: string
): Promise<ListItemRow> {
  const [created] = await db
    .insert(listItems)
    .values({
      listId,
      title,
      done: false,
      position: sql`(
        select coalesce(max(${listItems.position}), -1) + 1
        from ${listItems}
        where ${listItems.listId} = ${listId}
      )`,
    })
    .returning();
  return created;
}
