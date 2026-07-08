import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import authConfig from "./auth.config";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { authorizeCredentials } from "@/lib/auth/authorize";

// Full Auth.js config. Imported by:
//   - src/app/api/auth/[...nextauth]/route.ts  (GET/POST handlers)
//   - src/app/api/register/route.ts            (signIn() after creating a user)
//   - any server code that needs auth() / signIn() / signOut()
//
// This file pulls in Drizzle + postgres + bcryptjs, so it must NEVER be
// imported from middleware.ts (Edge runtime) — see auth.config.ts.
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "credentials",
      name: "Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // next-auth's contract: return a user object on success, or `null` on
      // any failure (unknown email, wrong password, malformed input). Never
      // throw for "bad credentials" — throwing produces a generic
      // CallbackRouteError instead of the clean "invalid credentials" state
      // the /login page needs to render. The actual matching logic lives in
      // lib/auth/authorize.ts so it's unit-testable without next-auth/DB.
      async authorize(credentials) {
        return authorizeCredentials(credentials, async (email) => {
          const [row] = await db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              passwordHash: users.passwordHash,
            })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
          return row;
        });
      },
    }),
  ],
  callbacks: {
    // Inherit the `authorized` (middleware gate) callback from auth.config.ts;
    // layer the JWT/session shape on top here since it needs the `user.id`
    // that only exists once the Credentials provider has run.
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token?.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
