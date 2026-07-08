import { describe, expect, it } from "vitest";
import { GET } from "./route";

// Given/When/Then coverage for PLAN.md Section 3 Interfaces row:
// "GET /healthz | GET | public | Returns 200, used by Docker HEALTHCHECK
// and platform deploy gate."
describe("GET /healthz", () => {
  it("given the app is running, when /healthz is requested, then it returns 200", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("given the app is running, when /healthz is requested, then the body is readable text (not an error page)", async () => {
    const res = await GET();
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });
});
