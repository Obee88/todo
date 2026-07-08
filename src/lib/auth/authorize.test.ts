import { describe, expect, it, vi } from "vitest";
import { authorizeCredentials, type AuthUserRow } from "./authorize";
import { hashPassword } from "./password";

// Given/When/Then coverage for PLAN.md Section 3 acceptance criterion:
// "Given a registered user, when they submit correct credentials to
// /login, then they receive a valid session ... incorrect credentials show
// an error and create no session." This tests the exact matching logic the
// Credentials provider's `authorize()` delegates to (src/auth.ts), with the
// DB lookup replaced by a mock — matches next-auth's `authorize` contract:
// return a user object on success, `null` on any failure.
describe("authorizeCredentials", () => {
  it("given valid credentials for an existing user, when authorized, then it returns the user object", async () => {
    const passwordHash = await hashPassword("correct-password");
    const row: AuthUserRow = {
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      passwordHash,
    };
    const findUserByEmail = vi.fn().mockResolvedValue(row);

    const result = await authorizeCredentials(
      { email: "Alice@Example.com", password: "correct-password" },
      findUserByEmail
    );

    expect(result).toEqual({
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
    });
    // Lookup must use the normalized (lowercased) email.
    expect(findUserByEmail).toHaveBeenCalledWith("alice@example.com");
  });

  it("given an unknown email, when authorized, then it returns null", async () => {
    const findUserByEmail = vi.fn().mockResolvedValue(undefined);

    const result = await authorizeCredentials(
      { email: "nobody@example.com", password: "whatever" },
      findUserByEmail
    );

    expect(result).toBeNull();
  });

  it("given a known email with the wrong password, when authorized, then it returns null", async () => {
    const passwordHash = await hashPassword("correct-password");
    const row: AuthUserRow = {
      id: "user-1",
      email: "alice@example.com",
      name: null,
      passwordHash,
    };
    const findUserByEmail = vi.fn().mockResolvedValue(row);

    const result = await authorizeCredentials(
      { email: "alice@example.com", password: "wrong-password" },
      findUserByEmail
    );

    expect(result).toBeNull();
  });

  it("given missing email or password fields, when authorized, then it returns null without querying the DB", async () => {
    const findUserByEmail = vi.fn();

    await expect(
      authorizeCredentials({ email: "alice@example.com" }, findUserByEmail)
    ).resolves.toBeNull();
    await expect(
      authorizeCredentials({ password: "secret" }, findUserByEmail)
    ).resolves.toBeNull();
    await expect(
      authorizeCredentials(undefined, findUserByEmail)
    ).resolves.toBeNull();

    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("given non-string credential fields, when authorized, then it returns null", async () => {
    const findUserByEmail = vi.fn();

    const result = await authorizeCredentials(
      { email: 12345, password: { not: "a string" } },
      findUserByEmail
    );

    expect(result).toBeNull();
    expect(findUserByEmail).not.toHaveBeenCalled();
  });
});
