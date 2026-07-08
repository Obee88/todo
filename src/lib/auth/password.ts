import bcrypt from "bcryptjs";

// Small, dependency-light helpers extracted from the register/authorize
// flows so they're unit-testable without mocking next-auth or the DB.
//
// # DECISION: bcrypt cost factor 10 — rationale: bcryptjs default and the
// value already proven on the dashboard (vps/dashboard/src/auth.ts uses the
// same library with default cost); balances hashing latency against brute
// force resistance for a Credentials-only app. Alternatives considered:
// cost 12 (rejected — noticeably slower per-request hashing with marginal
// benefit for v1, no reported threat model requiring it). Reversal cost:
// low — changing the cost factor only affects newly-hashed passwords,
// bcrypt hashes embed their own cost so existing hashes keep verifying.
const BCRYPT_COST = 10;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
