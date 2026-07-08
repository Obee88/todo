import type { Config } from "drizzle-kit";

// Used by `npm run db:generate` to diff src/lib/db/schema.ts against the
// drizzle/ folder and emit new SQL migrations. The runtime migration runner
// (scripts/migrate.mjs) doesn't use this — it just applies SQL files in
// lexicographic order at container startup.
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
} satisfies Config;
