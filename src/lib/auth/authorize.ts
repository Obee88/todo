import { normalizeEmail, verifyPassword } from "@/lib/auth/password";

// Extracted from the Credentials provider's `authorize()` in src/auth.ts so
// the matching logic is unit-testable without importing next-auth or a real
// DB client (next-auth's `authorize` signature is tightly coupled to the
// provider registration and isn't easily invoked in isolation from tests).
//
// # DECISION: pass in a `findUserByEmail` function rather than importing
// `db` directly — rationale: lets tests supply a stub/mock without touching
// Drizzle or Postgres (sandbox has no live DB), while production code
// (src/auth.ts) passes a real DB-backed lookup. Alternatives considered:
// mock the `@/lib/db` module directly in tests (rejected — more brittle,
// couples tests to Drizzle's query builder chain shape; this seam is
// simpler and mirrors normal dependency injection). Reversal cost: low,
// this file has no other consumers.
export type CredentialsInput = {
  email?: unknown;
  password?: unknown;
};

export type AuthUserRow = {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
};

export type AuthorizedUser = {
  id: string;
  email?: string;
  name?: string;
};

export async function authorizeCredentials(
  credentials: CredentialsInput | undefined,
  findUserByEmail: (email: string) => Promise<AuthUserRow | undefined>
): Promise<AuthorizedUser | null> {
  const email =
    typeof credentials?.email === "string"
      ? normalizeEmail(credentials.email)
      : null;
  const password =
    typeof credentials?.password === "string" ? credentials.password : null;

  // next-auth contract: return null (not throw) for any "credentials didn't
  // work" case, including malformed input — throwing surfaces as a generic
  // error instead of the clean invalid-credentials state /login expects.
  if (!email || !password) return null;

  const row = await findUserByEmail(email);
  if (!row?.passwordHash) return null;

  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return null;

  return {
    id: row.id,
    email: row.email ?? undefined,
    name: row.name ?? undefined,
  };
}
