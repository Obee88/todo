import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listItems } from "@/lib/db/schema";
import { getAccessibleList } from "@/lib/lists";

// PATCH/DELETE /api/lists/[id]/items/[itemId] — PLAN.md Section 3
// Interfaces: "PATCH ... required, access-checked ... { title?, done? } ->
// updates item." / "DELETE ... required, access-checked ... Deletes item."
//
// # DECISION: partial-update schema — both `title` and `done` are optional,
// but at least one must be present, and each provided field is validated
// independently. The route only sets the keys actually present in the
// parsed body (see the `set` object construction below), so a PATCH with
// only `{ done: true }` never touches `title` and vice versa. This is what
// makes toggling `done` provably not touch `position`: `position` is never
// part of this schema or the `set` object at all — there is no code path in
// this route that can write to `position`, so "toggling done never changes
// position" holds by construction, not by convention.
const patchItemSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(500).optional(),
    done: z.boolean().optional(),
  })
  .refine((data) => data.title !== undefined || data.done !== undefined, {
    message: "At least one of title or done must be provided",
  });

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id: listId, itemId } = await params;

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

  const parsed = patchItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const list = await getAccessibleList(userId, listId);
  if (!list) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // # DECISION: only include keys that were actually present in the parsed
  // input, built up explicitly rather than spreading `parsed.data` — zod's
  // `.optional()` fields are simply absent from `parsed.data` when not sent
  // (not present as `undefined`), so `{...parsed.data, updatedAt: new
  // Date()}` would already do the right thing here; this explicit
  // construction is kept anyway to make the "only mutate fields provided"
  // contract visible at the call site rather than relying on zod's
  // undefined-omission behavior implicitly. `position` is never assignable
  // here — proof that toggling `done` cannot move an item within its group.
  const updates: Partial<typeof listItems.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.done !== undefined) updates.done = parsed.data.done;

  const [updated] = await db
    .update(listItems)
    .set(updates)
    .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated, { status: 200 });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id: listId, itemId } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const list = await getAccessibleList(userId, listId);
  if (!list) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [deleted] = await db
    .delete(listItems)
    .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
