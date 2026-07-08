import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth() and the DB client — no live Postgres/next-auth request
// context is available in this sandbox (see agents-logs.txt), matching the
// pattern in src/app/api/register/route.test.ts.
const authMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

const { POST } = await import("./route");

function makeInsertChain(result: unknown[]) {
  return {
    values: () => ({
      returning: () => Promise.resolve(result),
    }),
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/lists", () => {
  beforeEach(() => {
    authMock.mockReset();
    insertMock.mockReset();
  });

  // Given/When/Then: PLAN.md acceptance criterion — "Given an authenticated
  // user, when they create a list with a name, then the list appears on
  // their / page with them as owner."
  it("given an authenticated user, when they create a list with a name, then it is created with them as owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const created = {
      id: "list-1",
      name: "Groceries",
      ownerId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    insertMock.mockReturnValue(makeInsertChain([created]));

    const res = await POST(jsonRequest({ name: "Groceries" }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ownerId).toBe("user-1");
    expect(body.name).toBe("Groceries");
  });

  it("given no session, when creating a list, then it returns 401 and does not touch the DB", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(jsonRequest({ name: "Groceries" }));

    expect(res.status).toBe(401);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("given an authenticated user, when the name is missing, then it returns 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({}));

    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("given an authenticated user, when the name is blank/whitespace, then it returns 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ name: "   " }));

    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
