import type { NextAuthConfig } from "next-auth";

// Edge-safe slice of the Auth.js config. Imported by both:
//   - src/middleware.ts   (runs in the Edge runtime — must NOT touch the DB
//     or any Node-only module, e.g. bcryptjs, postgres)
//   - src/auth.ts         (extends this with the Credentials provider + DB
//     lookup, which does need Node/DB access)
//
// The `authorized` callback is how middleware decides whether a request may
// proceed. Returning `false` triggers next-auth's built-in redirect to
// `pages.signIn` (with `?callbackUrl=<originalPath>` appended).
//
// # DECISION: split auth.config.ts (Edge-safe) from auth.ts (Node/DB) —
// rationale: mirrors the proven vps/dashboard split; Next.js middleware runs
// on the Edge runtime by default, which cannot load `bcryptjs`/`postgres`.
// Putting the Credentials provider (which needs both) directly in
// middleware.ts would break at the framework level. Alternatives considered:
// a single auth.ts imported everywhere (rejected — fails in middleware.ts
// with an Edge-runtime module error); configuring middleware with
// `runtime: "nodejs"` (rejected — next-auth's own docs and the dashboard
// precedent both use the split-config approach as the supported pattern, and
// forcing Node runtime in middleware has broader platform implications not
// worth taking on here). Reversal cost: low, isolated to these two files.
export default {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isAuthed = !!auth?.user;
      const { pathname } = nextUrl;

      // Public routes: next-auth's own handler, the sign-in/register pages,
      // the register API, and the health check. Everything else requires a
      // session. See PLAN.md Section 3 middleware contract in Task 2 scope.
      const isPublicPage = pathname === "/login" || pathname === "/register";
      const isAuthApi = pathname.startsWith("/api/auth");
      const isRegisterApi = pathname === "/api/register";
      const isHealthz = pathname === "/healthz";

      if (isAuthApi || isRegisterApi || isHealthz) return true;

      if (isPublicPage) {
        // Already-signed-in users don't need to see the login/register form
        // again — bounce them to the app root instead.
        return isAuthed ? Response.redirect(new URL("/", nextUrl)) : true;
      }

      // Any other API route: prefer 401 JSON-ish behavior over an HTML
      // redirect so fetch() callers get a sane status code. Non-API routes
      // fall through to next-auth's default redirect-to-signIn behavior.
      if (!isAuthed && pathname.startsWith("/api")) {
        return new Response("Unauthorized", { status: 401 });
      }

      return isAuthed;
    },
  },
  // JWT sessions only: the Credentials provider doesn't support DB sessions,
  // and PLAN.md explicitly says no Auth.js adapter/session/account tables
  // are needed for this app. Tokens are signed with AUTH_SECRET.
  session: { strategy: "jwt" },
  trustHost: true,
} satisfies NextAuthConfig;
