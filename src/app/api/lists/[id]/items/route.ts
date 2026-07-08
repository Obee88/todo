import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { getAccessibleList } from "@/lib/lists";
import { insertListItem } from "@/lib/items";

// POST /api/lists/[id]/items — PLAN.md Section 3 Interfaces:
// "POST ... required, access-checked ... { title } -> appends item at end
// of undone group."
//
// # DECISION: "access-checked" here reuses getAccessibleList as-is
// (owner-only until Task 5 adds `list_member`) — per this task's explicit
// instruction, item routes are access-checked (owner OR member may act),
// but membership doesn't exist until Task 5, so today this collapses to the
// same owner-only check Task 3 already built. No new access logic is
// introduced in this file; Task 5 extending getAccessibleList's WHERE
// clause automatically upgrades every item route that calls it, with zero
// changes needed here.
const createItemSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { id: listId } = await params;

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

  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // 404 (not 403) for both "list doesn't exist" and "list exists but caller
  // has no access" — same rule PATCH/DELETE /api/lists/[id] already enforce
  // (see src/lib/lists.ts's getAccessibleList doc comment).
  const list = await getAccessibleList(userId, listId);
  if (!list) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const created = await insertListItem(listId, parsed.data.title);

  return NextResponse.json(created, { status: 201 });
}
