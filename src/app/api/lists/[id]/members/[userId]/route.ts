import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listMembers } from "@/lib/db/schema";
import { getOwnedList } from "@/lib/lists";

// DELETE /api/lists/[id]/members/[userId] — PLAN.md Section 3 Interfaces:
// "DELETE ... required, owner-only ... Removes a contributor."
//
// # DECISION: owner-only via `getOwnedList`, same reasoning as the sibling
// POST route in ./route.ts — sharing management (add/remove) is exclusively
// an owner privilege; a mere member (even removing themselves) must get 404
// here, not a 403 or a 200. PLAN.md does not specify a "leave list"
// self-service action for members, so this route intentionally does not
// special-case `userId === session user id`.
type RouteParams = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id: listId, userId: targetUserId } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const list = await getOwnedList(userId, listId);
  if (!list) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [deleted] = await db
    .delete(listMembers)
    .where(
      and(
        eq(listMembers.listId, listId),
        eq(listMembers.userId, targetUserId)
      )
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
