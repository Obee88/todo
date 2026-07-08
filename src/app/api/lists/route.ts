import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { lists } from "@/lib/db/schema";

// POST /api/lists — PLAN.md Section 3 Interfaces:
// "{ name } -> creates list, current user becomes owner."
const createListSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});

export async function POST(request: Request) {
  // # DECISION: re-check `auth()` inside the route handler even though
  // middleware.ts already blocks unauthenticated requests to non-public
  // API routes with a 401 — rationale: middleware's `authorized` callback
  // proves a session *cookie* parsed successfully, but the route still needs
  // the actual `session.user.id` value to know who the owner is, and relying
  // solely on middleware would make this route's authorization untestable/
  // unverifiable in isolation (unit tests import route handlers directly,
  // bypassing middleware entirely). Alternatives considered: trust a header
  // middleware could inject (rejected — next-auth's Edge middleware doesn't
  // forward decoded session claims via headers in this setup, and inventing
  // that plumbing is unnecessary complexity for one field). Reversal cost:
  // low.
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

  const parsed = createListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(lists)
    .values({ name: parsed.data.name, ownerId: userId })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
