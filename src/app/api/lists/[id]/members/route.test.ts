import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth(), the DB client, and the owner-only access-check helper.
// Route-level authorization/validation branching is under test here.
const authMock = vi.fn();
const selectMock = vi.fn();
const insertMock = vi.fn();
const getOwnedListMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

vi.mock("@/lib/lists", () => ({
  getOwnedList: (...args: unknown[]) => getOwnedListMock(...args),
}));

const { POST } = await import("./route");

function postRequest(body: unknown) {
  return new Request("http://localhost/api/lists/list-1/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(id = "list-1") {
  return { params: Promise.resolve({ id }) };
}

const sampleList = {
  id: "list-1",
  name: "Groceries",
  ownerId: "owner-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// select() is called up to twice per request: (1) look up the invitee by
// email, (2) check for an existing list_member row. Each call site uses
// select().from().where().limit(). Configure sequential results via
// mockReturnValueOnce chains.
function makeSelectChain(result: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(result),
      }),
    }),
  };
}

function makeInsertChain() {
  return {
    values: () => Promise.resolve(undefined),
  };
}

describe("POST /api/lists/[id]/members", () => {
  beforeEach(() => {
    authMock.mockReset();
    selectMock.mockReset();
    insertMock.mockReset();
    getOwnedListMock.mockReset();
  });

  // Given/When/Then: PLAN.md acceptance criterion — "Given a list owner,
  // when they invite an existing registered user by email, then that user
  // gains contributor access."
  it("given the owner invites an existing user by email, when posting, then it inserts a list_member row and returns 201", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(sampleList);
    selectMock
      .mockReturnValueOnce(makeSelectChain([{ id: "invitee-1" }])) // user lookup
      .mockReturnValueOnce(makeSelectChain([])); // no existing member
    insertMock.mockReturnValue(makeInsertChain());

    const res = await POST(
      postRequest({ email: "Bob@Example.com" }),
      ctx()
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: "invitee-1", email: "bob@example.com" });
    expect(insertMock).toHaveBeenCalled();
  });

  // Given/When/Then: PLAN.md acceptance criterion — "Given a list owner,
  // when they invite an email with no matching account, then the request is
  // rejected with an error indicating no such account exists."
  it("given no account exists for the invited email, when posting, then it returns 404 with a clear message and does not insert", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(sampleList);
    selectMock.mockReturnValueOnce(makeSelectChain([])); // no such user

    const res = await POST(
      postRequest({ email: "nobody@example.com" }),
      ctx()
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no account exists/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Given/When/Then: access control — only the owner may invite; a
  // non-owner (including a mere member) gets 404, same as a nonexistent
  // list, per PLAN.md's "404 not 403" rule.
  it("given a non-owner, when posting an invite, then it returns 404 and does not look up the invitee", async () => {
    authMock.mockResolvedValue({ user: { id: "not-the-owner" } });
    getOwnedListMock.mockResolvedValue(undefined);

    const res = await POST(postRequest({ email: "bob@example.com" }), ctx());

    expect(res.status).toBe(404);
    expect(selectMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Given/When/Then (Task 5 REGRESSION GUARD): a mere member must not be
  // able to invite other users either — sharing management is owner-only.
  it("given a mere member (not owner), when posting an invite, then it returns 404", async () => {
    authMock.mockResolvedValue({ user: { id: "member-1" } });
    getOwnedListMock.mockResolvedValue(undefined); // member is not owner

    const res = await POST(postRequest({ email: "bob@example.com" }), ctx());

    expect(res.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("given a nonexistent list, when posting an invite, then it returns 404", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(undefined);

    const res = await POST(
      postRequest({ email: "bob@example.com" }),
      ctx("nonexistent")
    );

    expect(res.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("given no session, when posting an invite, then it returns 401", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(postRequest({ email: "bob@example.com" }), ctx());

    expect(res.status).toBe(401);
    expect(getOwnedListMock).not.toHaveBeenCalled();
  });

  it("given a malformed email, when posting an invite, then it returns 400", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });

    const res = await POST(postRequest({ email: "not-an-email" }), ctx());

    expect(res.status).toBe(400);
    expect(getOwnedListMock).not.toHaveBeenCalled();
  });

  it("given invalid JSON, when posting an invite, then it returns 400", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });

    const badReq = new Request("http://localhost/api/lists/list-1/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await POST(badReq, ctx());

    expect(res.status).toBe(400);
  });

  // # DECISION (documented in route.ts): inviting the owner themselves is
  // rejected with 400, since the owner already has full access and is never
  // duplicated into list_member per the data model.
  it("given the owner invites themselves, when posting, then it returns 400 and does not insert", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(sampleList);
    selectMock.mockReturnValueOnce(makeSelectChain([{ id: "owner-1" }])); // invitee IS the owner

    const res = await POST(postRequest({ email: "owner@example.com" }), ctx());

    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // # DECISION (documented in route.ts): duplicate invite (already a
  // member) is treated as idempotent success, not a conflict error.
  it("given the invitee is already a member, when posting again, then it returns 200 without inserting a duplicate row", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(sampleList);
    selectMock
      .mockReturnValueOnce(makeSelectChain([{ id: "invitee-1" }])) // user lookup
      .mockReturnValueOnce(makeSelectChain([{ userId: "invitee-1" }])); // already a member

    const res = await POST(postRequest({ email: "bob@example.com" }), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyMember).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
