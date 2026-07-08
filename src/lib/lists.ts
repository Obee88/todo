import { and, desc, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { listMembers, lists, users } from "@/lib/db/schema";

export type ListRow = typeof lists.$inferSelect;

export type ListMemberRow = {
  userId: string;
  email: string;
  name: string | null;
  createdAt: Date;
};

// Access-check helpers for the `list` resource, shared by Task 3 (list
// CRUD), Task 4 (item routes), and Task 5 (this task — sharing routes).
//
// PLAN.md Section 3 "Access control rules":
//   "A user can access list L if L.owner_id = user.id OR a list_member row
//   exists for (L.id, user.id)." ... "Only L.owner_id = user.id may: rename
//   L, delete L, add/remove list_member rows." ... "All list/item routes
//   return 404 (not 403) for lists the user cannot access, to avoid leaking
//   list existence."
//
// # DECISION: now that both an "owner-or-member" check (getAccessibleList)
// and a genuinely "owner-only" check (isListOwner) exist side by side, they
// are implemented as two independent queries rather than one calling the
// other — previously (Tasks 3/4) isListOwner was defined in terms of
// getAccessibleList because the two were identical (no list_member rows
// could exist yet). Now that getAccessibleList also matches via
// list_member, isListOwner must NOT delegate to it — a mere member must
// fail isListOwner even though they pass getAccessibleList. Alternatives
// considered: keep isListOwner as `(await getAccessibleList(...)).ownerId
// === userId` (rejected — this would work, but it does an unnecessary OR
// join for a query that only ever needs the owner_id column, and it's easy
// to accidentally regress if getAccessibleList's shape ever changes to omit
// ownerId from the selected columns; a direct, independent WHERE
// owner_id = ? clause makes the "owner-only" guarantee self-evident from
// this function alone, which is exactly the property Task 3/4's
// rename/delete/manage-sharing routes depend on not regressing).
// Reversal cost: low — both are small, independently testable queries.

/**
 * Returns the list with id `listId` if `userId` currently has access to it
 * — owner OR member, per PLAN.md's access-control rule — otherwise
 * `undefined`.
 *
 * # DECISION: return `undefined` (not throw, not a discriminated result)
 * for "not found or no access" — rationale: callers (route handlers, page
 * components) need exactly one branch to produce a uniform 404, and
 * PLAN.md's access-control rule requires that "list doesn't exist" and
 * "list exists but caller lacks access" be indistinguishable from the
 * caller's perspective. A single falsy return value makes that
 * indistinguishability the natural/default behavior rather than something
 * each call site has to remember to collapse. Alternatives considered:
 * throwing a NotFoundError (rejected — would require every call site to
 * catch it, and risks a stack trace/message leaking which branch occurred
 * during development); returning a { found, authorized } shape (rejected —
 * directly invites a caller to branch on 403 vs 404, which is exactly what
 * the spec forbids). Reversal cost: low, single function, few call sites so
 * far.
 *
 * # DECISION (Task 5): extended the WHERE clause with an OR against a
 * correlated EXISTS-style subquery-free join isn't available without a
 * join, so this uses a LEFT JOIN onto list_member filtered to the current
 * user, then matches rows where the list is owned by the user OR the join
 * produced a matching member row. Implemented as `leftJoin` + `or(eq(owner),
 * ne(memberUserId, null))`-shaped condition below. This is the single call
 * site every other route/page in the app relies on for "does this user have
 * ANY access" — this is the change that makes Task 5's core requirement
 * ("access" means owner OR member everywhere) true for every route that
 * already calls this helper (list PATCH/DELETE will be moved off this
 * helper below; item routes and the list detail page keep using it
 * unchanged and are upgraded automatically). Alternatives considered: two
 * separate queries (SELECT list; if not owner, SELECT list_member) — two
 * round-trips instead of one; a raw `exists` subquery via drizzle's `sql`
 * template — rejected in favor of a plain join since drizzle's query
 * builder expresses it directly without dropping to raw SQL. Reversal cost:
 * low, isolated to this one function body.
 */
export async function getAccessibleList(
  userId: string,
  listId: string
): Promise<ListRow | undefined> {
  const [row] = await db
    .select({
      id: lists.id,
      name: lists.name,
      ownerId: lists.ownerId,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt,
    })
    .from(lists)
    .leftJoin(
      listMembers,
      and(eq(listMembers.listId, lists.id), eq(listMembers.userId, userId))
    )
    .where(
      and(
        eq(lists.id, listId),
        or(eq(lists.ownerId, userId), eq(listMembers.userId, userId))
      )
    )
    .limit(1);
  return row;
}

/**
 * True if `userId` is the OWNER of list `listId` — NOT satisfied by mere
 * membership. This is the genuinely owner-only check, distinct from
 * `getAccessibleList` (owner OR member). Gates rename/delete/manage-sharing
 * (add/remove `list_member` rows), per PLAN.md: "Only L.owner_id = user.id
 * may: rename L, delete L, add/remove list_member rows."
 *
 * # DECISION: query `lists` directly on `(id, ownerId)` rather than reusing
 * `getAccessibleList` — see the module-level DECISION above for why the two
 * checks must not share an implementation now that membership exists.
 */
export async function isListOwner(
  userId: string,
  listId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.ownerId, userId)))
    .limit(1);
  return !!row;
}

/**
 * Returns the list with id `listId` if `userId` OWNS it (not a mere
 * member), otherwise `undefined`. Same 404-collapsing contract as
 * `getAccessibleList`, but for owner-only routes that also need the list
 * row itself (e.g. PATCH /api/lists/[id] returns the updated row).
 *
 * # DECISION: added as a thin wrapper (rather than having owner-only routes
 * call `isListOwner` then `getAccessibleList` again, or call
 * `getAccessibleList` and separately compare `ownerId`) — a member could
 * pass `getAccessibleList` but must get 404 (not 403) from PATCH/DELETE
 * /api/lists/[id] and from the members routes, so those routes need a
 * single helper whose success already encodes "owner," matching the
 * existing "one helper call -> one 404 branch" shape used everywhere else
 * in the codebase (see `getAccessibleList`'s own doc comment). Reversal
 * cost: low.
 */
export async function getOwnedList(
  userId: string,
  listId: string
): Promise<ListRow | undefined> {
  const [row] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.ownerId, userId)))
    .limit(1);
  return row;
}

/** All lists owned by `userId`, most recently created first. Used by `/`
 * (owned-lists half of the home page view). */
export async function getOwnedLists(userId: string): Promise<ListRow[]> {
  return db
    .select()
    .from(lists)
    .where(eq(lists.ownerId, userId))
    .orderBy(desc(lists.createdAt));
}

/**
 * All lists `userId` is a contributor (member) on — NOT including lists
 * they own. Used by `/` to render the "shared with you" section separately
 * from owned lists.
 *
 * # DECISION: kept distinct from `getOwnedLists` / a combined
 * `getAccessibleLists` rather than merging owned+shared into one query with
 * a computed `isOwner` flag — rationale: the home page (PLAN.md's literal
 * interface spec: "Lists the user's own lists + lists shared with them")
 * reads naturally as two sections, and keeping the two queries separate
 * means each stays simple (no UNION, no join-then-dedupe) and independently
 * testable, matching the existing `getOwnedLists` shape exactly. Reversal
 * cost: low — a combined helper could be added later without removing
 * these two.
 */
export async function getMemberLists(userId: string): Promise<ListRow[]> {
  const rows = await db
    .select({
      id: lists.id,
      name: lists.name,
      ownerId: lists.ownerId,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt,
    })
    .from(listMembers)
    .innerJoin(lists, eq(listMembers.listId, lists.id))
    .where(eq(listMembers.userId, userId))
    .orderBy(desc(lists.createdAt));
  return rows;
}

/**
 * All contributors (list_member rows) on list `listId`, joined with `users`
 * for display (email/name), oldest-invited first. Used by the owner-only
 * MembersPanel on `/lists/[id]` to render the current member list.
 *
 * # DECISION: no access check inside this helper itself — callers (the
 * `/lists/[id]` page) are expected to have already established the caller
 * is the owner (or at least has access) before calling this, same pattern
 * as `getSortedListItems` in src/lib/items.ts, which also assumes the
 * caller already ran an access check. Reversal cost: low, single call site
 * today.
 */
export async function getListMembers(listId: string): Promise<ListMemberRow[]> {
  return db
    .select({
      userId: listMembers.userId,
      email: users.email,
      name: users.name,
      createdAt: listMembers.createdAt,
    })
    .from(listMembers)
    .innerJoin(users, eq(listMembers.userId, users.id))
    .where(eq(listMembers.listId, listId))
    .orderBy(listMembers.createdAt);
}
