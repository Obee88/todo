import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listMembers, users } from "@/lib/db/schema";
import { getOwnedList } from "@/lib/lists";
import { normalizeEmail } from "@/lib/auth/password";

// POST /api/lists/[id]/members — PLAN.md Section 3 Interfaces:
// "POST ... required, owner-only ... { email } -> adds list_member if a
// user with that email exists; 404 if not."
//
// # DECISION: owner-only check uses `getOwnedList` (NOT `getAccessibleList`)
// — see src/lib/lists.ts's module-level DECISION and
// src/app/api/lists/[id]/route.ts's DECISION for the same reasoning: sharing
// management is explicitly owner-only per PLAN.md's access-control rule
// ("Only L.owner_id = user.id may ... add/remove list_member rows"), and a
// mere contributor must get the same 404 as a total stranger, never a 403
// that would reveal the list exists but they lack permission.
const inviteSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Invalid email"),
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

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // 404 for both "list doesn't exist" and "caller isn't the owner" (a mere
  // member included) — same rule every other route in this app enforces.
  const list = await getOwnedList(userId, listId);
  if (!list) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const email = normalizeEmail(parsed.data.email);

  const [invitee] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // # DECISION: 404 with a clear message when no account exists for the
  // given email — literal PLAN.md interface spec ("404 if not") and
  // acceptance criterion ("rejected with an error indicating no such
  // account exists"). Chose 404 (not 400/422) because the spec's Interfaces
  // table states it explicitly for this exact route, distinguishing it from
  // generic validation errors (which stay 400, e.g. malformed email).
  if (!invitee) {
    return NextResponse.json(
      { error: "No account exists for that email address." },
      { status: 404 }
    );
  }

  // # DECISION: inviting the owner themselves — rejected with 400. The
  // owner already has full access via `lists.owner_id` and PLAN.md's data
  // model is explicit that "the owner is *not* duplicated" in list_member.
  // Alternatives considered: silently no-op / treat as idempotent success
  // (rejected — an owner accidentally "inviting themselves" is a caller
  // mistake worth surfacing, not a state that should look like it created
  // sharing; also, inserting the owner into list_member would violate the
  // schema's documented invariant even though no FK/unique constraint
  // technically forbids it). Reversal cost: low, single early check.
  if (invitee.id === userId) {
    return NextResponse.json(
      { error: "The list owner already has access and cannot be invited." },
      { status: 400 }
    );
  }

  // # DECISION: duplicate invite (inviting an already-existing member) is
  // treated as idempotent success (200, not a 409 conflict) — rationale:
  // the desired end state ("this user is a contributor on this list") is
  // already true, and PLAN.md doesn't specify a distinct error for this
  // case; re-POSTing the same invite is a natural retry/refresh action from
  // the UI (e.g. double-click) and idempotent success avoids the invite
  // form needing special-case error handling for "already a member," which
  // isn't really an error from the caller's perspective. Alternatives
  // considered: 409 Conflict (rejected — would require the MembersPanel to
  // special-case this into a non-error message anyway; simpler to just
  // treat it as success since the outcome the owner wanted is already true).
  // Reversal cost: low — changing to a 409 later only touches this one
  // check and the corresponding test/UI message.
  const [existingMember] = await db
    .select({ userId: listMembers.userId })
    .from(listMembers)
    .where(
      and(eq(listMembers.listId, listId), eq(listMembers.userId, invitee.id))
    )
    .limit(1);

  if (existingMember) {
    return NextResponse.json(
      { id: invitee.id, email, alreadyMember: true },
      { status: 200 }
    );
  }

  await db.insert(listMembers).values({
    listId,
    userId: invitee.id,
    invitedBy: userId,
  });

  return NextResponse.json({ id: invitee.id, email }, { status: 201 });
}
