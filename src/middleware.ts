import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Edge middleware. Deliberately built from `auth.config.ts` only (no
// Credentials provider, no DB, no bcryptjs) — see the DECISION comment in
// auth.config.ts for why. The `authorized` callback there is the single
// source of truth for which routes are public vs. require a session; keep
// that logic there, not here, so auth.ts and middleware.ts can't drift.
export const { auth: middleware } = NextAuth(authConfig);

// PLAN.md Task 2 scope: "unauthenticated requests to any route other than
// /login, /register, /api/auth/*, /api/register, and /healthz redirect to
// /login." The matcher below runs middleware on every request except
// Next.js internals and static assets; auth.config.ts's `authorized`
// callback then makes the actual allow/redirect decision per-path.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
