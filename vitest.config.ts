import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// # DECISION: add the `@/*` path alias here (mirroring tsconfig.json's
// `paths`) — rationale: Task 2 introduces the first cross-directory imports
// under test (src/lib/auth/authorize.ts imports "@/lib/auth/password",
// src/app/api/register/route.ts imports "@/lib/db" and "@/auth"); Vitest
// (via Vite) does not read tsconfig `paths` automatically without either
// this explicit `resolve.alias` or a tsconfig-paths plugin. Alternatives
// considered: `vite-tsconfig-paths` plugin (rejected — an extra dependency
// for a one-line alias that's already fully known); relative imports only
// in test-adjacent files (rejected — would fight the codebase-wide `@/*`
// convention already used by non-test source files). Reversal cost: low.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Workaround for a Vitest/Vite ESM-resolver quirk with this Next.js
      // install: the bare specifier "next/server" (imported transitively by
      // next-auth/lib/env.js) fails to resolve under Vite's resolver even
      // though Node's own `require.resolve("next/server")` finds
      // node_modules/next/server.js without issue. Aliasing the extension-
      // less specifier straight to that file sidesteps the resolver
      // mismatch without patching next-auth or next itself.
      "next/server": fileURLToPath(
        new URL("./node_modules/next/server.js", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
