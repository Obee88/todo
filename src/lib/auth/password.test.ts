import { describe, expect, it } from "vitest";
import { hashPassword, normalizeEmail, verifyPassword } from "./password";

// Given/When/Then coverage for PLAN.md Section 3 register/login behavior:
// password hashing must be verifiable, and email must be normalized
// (lowercased) before storage/lookup so "A@X.com" and "a@x.com" collide.
describe("normalizeEmail", () => {
  it("given a mixed-case email, when normalized, then it is lowercased", () => {
    expect(normalizeEmail("Alice@Example.COM")).toBe("alice@example.com");
  });

  it("given an email with surrounding whitespace, when normalized, then it is trimmed and lowercased", () => {
    expect(normalizeEmail("  Bob@Example.com  ")).toBe("bob@example.com");
  });
});

describe("hashPassword / verifyPassword", () => {
  it("given a plaintext password, when hashed, then the hash is not the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("given a hashed password, when verified with the correct plaintext, then it returns true", async () => {
    const hash = await hashPassword("hunter22222");
    await expect(verifyPassword("hunter22222", hash)).resolves.toBe(true);
  });

  it("given a hashed password, when verified with the wrong plaintext, then it returns false", async () => {
    const hash = await hashPassword("hunter22222");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("given the same password hashed twice, when compared, then the hashes differ (salted)", async () => {
    const [hashA, hashB] = await Promise.all([
      hashPassword("same-password"),
      hashPassword("same-password"),
    ]);
    expect(hashA).not.toBe(hashB);
  });
});
