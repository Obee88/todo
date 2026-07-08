// DECISION: expose the health endpoint at /healthz (a page-router-style
// route under src/app/healthz/route.ts) rather than /api/healthz —
// rationale: PLAN.md Section 3's Interfaces table and Section 4's Dockerfile
// HEALTHCHECK both specify `GET /healthz` verbatim (matching
// vps/MANAGED_PROJECT_GUIDE.md's example `wget -qO- http://localhost:3000/healthz`),
// so putting it under /api would require documenting a path override in the
// dashboard's "healthcheckPath" setting for no benefit. Alternatives
// considered: /api/healthz (also valid under the guide, but adds an
// unnecessary path segment vs. the plan's literal spec). Reversal cost: low
// — moving the route.ts file and updating the Dockerfile HEALTHCHECK/dashboard
// config are the only two touch points.
//
// No DB check here deliberately: the platform's HEALTHCHECK is meant to
// gate "is the Next.js server up and serving requests", not "is Postgres
// reachable" — a transient DB blip should not flip the container to
// unhealthy and trigger a restart loop. DB connectivity is exercised by
// scripts/migrate.mjs at startup, before this endpoint is ever probed.
export async function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}
