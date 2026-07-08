import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, normalizeEmail } from "@/lib/auth/password";
import { signIn } from "@/auth";

// POST /api/register — PLAN.md Section 3 Interfaces:
// "{ email, password, name? } -> 201 + session, or 409 if email taken."
const registerSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const { password, name } = parsed.data;

  // # DECISION: check-then-insert (SELECT for existing email, then INSERT)
  // rather than relying solely on catching the DB's unique-constraint
  // violation — rationale: simpler, more portable code path, and this app
  // has no meaningful concurrent-registration load where the race window
  // matters; the `email` column's `unique()` constraint (schema.ts) is still
  // the authoritative backstop against a duplicate row even if two requests
  // for the same email raced past this check (the later INSERT would fail
  // with a Postgres unique_violation, which we also catch below and map to
  // the same 409, so no duplicate row can ever be committed either way).
  // Alternatives considered: catch-only (rely purely on the unique
  // constraint and inspect the driver error code) — rejected as the sole
  // mechanism because it makes the common case (email already exists)
  // indistinguishable from other DB errors without fragile error-shape
  // sniffing; using both layers gives a clean common-case message and a
  // correctness backstop for the race. Reversal cost: low.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  let createdUserId: string;
  try {
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash, name: name ?? null })
      .returning({ id: users.id });
    createdUserId = created.id;
  } catch (err: unknown) {
    // Backstop for the race described above: Postgres unique_violation is
    // SQLSTATE 23505. The `postgres` driver surfaces this as a
    // `PostgresError` with a `code` property.
    const code = (err as { code?: string } | null)?.code;
    if (code === "23505") {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }
    throw err;
  }

  // # DECISION: call next-auth's `signIn("credentials", { email, password,
  // redirect: false })` immediately after creating the row, rather than
  // building a separate session-issuing code path — rationale: next-auth's
  // Credentials provider is normally invoked from a form POST to
  // /api/auth/callback/credentials, but `signIn()` from a Server Action or
  // Route Handler context (with `redirect: false`) drives the exact same
  // `authorize()` -> JWT -> Set-Cookie pipeline programmatically and returns
  // the session cookie on the response, which is exactly "establish a
  // session" without duplicating any JWT-signing logic. Alternatives
  // considered: mint a JWT/cookie by hand in this route (rejected — bypasses
  // next-auth's cookie naming/security options and would drift from the
  // /login path over time, doubling the surface area to keep in sync);
  // trigger a client-side signIn() call from the /register page after a 201
  // (rejected — spec says "the user is signed in" as part of this request's
  // outcome, and doing it server-side means the API contract itself
  // guarantees a session, not just the page glue on top of it).
  // Known limitation: `signIn` with `redirect: false` throws `AuthError` on
  // failure rather than returning a result object in this next-auth beta;
  // since we just inserted the row with a known-good hash, authorize() is
  // expected to always succeed here — a failure indicates the DB round-trip
  // is broken, so we still return 201 (registration itself did succeed) but
  // flag it, since re-registering would now hit the 409 path with no way to
  // recover a session except a normal /login.
  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
  } catch (err: unknown) {
    // # DECISION: detect an auth-layer failure by duck-typing on the
    // `type` property (every next-auth/@auth/core AuthError subclass,
    // including CredentialsSignin, sets `this.type`) rather than
    // `err instanceof AuthError` — rationale: importing `AuthError` from
    // "next-auth" pulls in next-auth/lib/env.js, which imports "next/server"
    // via a bare specifier that this project's Vitest/Vite resolver cannot
    // load in the test environment (works fine under Next's own build/
    // runtime, confirmed via direct `require.resolve`), even though the
    // route itself runs correctly in Next.js. Duck-typing avoids a test-only
    // resolver failure without weakening the production check: any
    // non-AuthError bug (e.g. a real DB outage) will not carry a `type`
    // string and will still rethrow below. Alternatives considered: keep
    // `instanceof AuthError` and patch around the resolver issue with a
    // Vitest alias (tried — did not resolve the bare specifier inside the
    // dependency's own ESM import, which Vite's alias config does not
    // intercept for externalized SSR deps). Reversal cost: low, isolated to
    // this one catch block.
    if (
      err &&
      typeof err === "object" &&
      "type" in err &&
      typeof (err as { type: unknown }).type === "string"
    ) {
      return NextResponse.json(
        {
          id: createdUserId,
          warning:
            "Account created but automatic sign-in failed; please log in.",
        },
        { status: 201 }
      );
    }
    throw err;
  }

  return NextResponse.json({ id: createdUserId }, { status: 201 });
}
