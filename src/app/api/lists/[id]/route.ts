import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { lists } from "@/lib/db/schema";
import { getOwnedList } from "@/lib/lists";

// PATCH/DELETE /api/lists/[id] — PLAN.md Section 3 Interfaces:
// "PATCH  ... required, owner-only ... { name } -> renames list."
// "DELETE ... required, owner-only ... Deletes list (cascade items +
// members)."
// Access control rule: "All list/item routes return 404 (not 403) for lists
// the user cannot access, to avoid leaking list existence." AND "Only
// L.owner_id = user.id may: rename L, delete L, add/remove list_member
// rows."
//
// # DECISION (Task 5): switched from `getAccessibleList` to `getOwnedList`
// — as of this task, `getAccessibleList` matches owner OR member, but these
// two routes must remain owner-only (a mere contributor must not be able to
// rename or delete the list). `getOwnedList` is the genuinely owner-only
// helper (see src/lib/lists.ts's module-level DECISION comment) that
// preserves the pre-Task-5 behavior of these routes exactly. This is the
// most important regression guard in this task — using the broadened helper
// here by mistake would silently let any contributor rename/delete the
// list.
const patchListSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // # DECISION: look up ownership via getOwnedList (owner-only) *before*
  // attempting the update, and return 404 for both "list does not exist"
  // and "list exists but caller isn't the owner" — rationale: this is the
  // literal PLAN.md access-control rule ("404, not 403 ... to avoid leaking
  // list existence"), and a non-owner (including a mere member) must not be
  // able to distinguish "no such list" from "list I'm not allowed to touch"
  // by status code. Alternatives considered: attempt the UPDATE
  // unconditionally with a `WHERE id = ? AND owner_id = ?` clause and infer
  // 404 from a zero-row result (rejected as the sole mechanism — it would
  // work correctly for PATCH/DELETE here, but read paths need the same
  // access-checked-then-act shape too, e.g. `/lists/[id]` GET, where there's
  // no "affected rows" signal at all; using one shared helper for every
  // route keeps the 404-vs-403 contract consistent everywhere instead of
  // re-deriving it ad hoc per route). Reversal cost: low.
  const existing = await getOwnedList(userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(lists)
    .set({ name: parsed.data.name, updatedAt: new Date() })
    .where(eq(lists.id, id))
    .returning();

  return NextResponse.json(updated, { status: 200 });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await getOwnedList(userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cascades to list_item and list_member rows via the FK `onDelete:
  // "cascade"` declared in schema.ts (verified already present — see
  // decision log / agents-logs.txt for Task 3; no schema change was needed).
  await db.delete(lists).where(eq(lists.id, id));

  return new NextResponse(null, { status: 204 });
}
