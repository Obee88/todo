import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth(), the DB client, and the access-check helper. Route-level
// authorization logic (owner-only enforcement, 404-not-403 semantics) is
// what's under test here — src/lib/lists.test.ts already covers
// getOwnedList/getAccessibleList's own query logic in isolation, so it's
// mocked here to isolate the route's branching. No live Postgres/next-auth
// request context is available in this sandbox (see agents-logs.txt).
//
// # DECISION (Task 5 regression check): this route now calls `getOwnedList`
// (genuinely owner-only), NOT `getAccessibleList` (owner OR member) — see
// src/app/api/lists/[id]/route.ts's DECISION comment. The mock below reflects
// that; a member-only fixture (see the new describe block further down)
// asserts a mere member is rejected exactly like a non-owner, which is the
// most important regression this task must not introduce.
const authMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const getOwnedListMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: (...args: unknown[]) => updateMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

vi.mock("@/lib/lists", () => ({
  getOwnedList: (...args: unknown[]) => getOwnedListMock(...args),
}));

const { PATCH, DELETE } = await import("./route");

function makeUpdateChain(result: unknown[]) {
  return {
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve(result),
      }),
    }),
  };
}

function makeDeleteChain() {
  return {
    where: () => Promise.resolve(undefined),
  };
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/lists/list-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request("http://localhost/api/lists/list-1", {
    method: "DELETE",
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

describe("PATCH /api/lists/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    updateMock.mockReset();
    getOwnedListMock.mockReset();
  });

  // Given/When/Then: PLAN.md acceptance criterion — "Given a list owner,
  // when they rename ... their list, then the change is persisted and
  // reflected immediately."
  it("given the list owner, when renaming, then it updates and returns the list", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(sampleList);
    const renamed = { ...sampleList, name: "New name" };
    updateMock.mockReturnValue(makeUpdateChain([renamed]));

    const res = await PATCH(patchRequest({ name: "New name" }), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New name");
    expect(getOwnedListMock).toHaveBeenCalledWith("owner-1", "list-1");
  });

  // Given/When/Then: "... a non-owner attempting the same action is
  // rejected" — PLAN.md access-control rule requires 404, not 403.
  it("given a non-owner, when attempting to rename, then it returns 404 and does not update", async () => {
    authMock.mockResolvedValue({ user: { id: "not-the-owner" } });
    getOwnedListMock.mockResolvedValue(undefined); // helper is owner-only

    const res = await PATCH(patchRequest({ name: "Hijacked" }), ctx());

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("given a nonexistent list, when attempting to rename, then it returns 404 (same as no-access)", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(undefined);

    const res = await PATCH(
      patchRequest({ name: "Doesn't matter" }),
      ctx("nonexistent-id")
    );

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("given no session, when attempting to rename, then it returns 401", async () => {
    authMock.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ name: "New name" }), ctx());

    expect(res.status).toBe(401);
    expect(getOwnedListMock).not.toHaveBeenCalled();
  });

  it("given the owner, when the new name is blank, then it returns 400 and does not update", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });

    const res = await PATCH(patchRequest({ name: "" }), ctx());

    expect(res.status).toBe(400);
    expect(getOwnedListMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  // Given/When/Then (Task 5 REGRESSION GUARD): a mere contributor (list_member,
  // not owner) must NOT be able to rename the list — this route calls
  // getOwnedList (owner-only), which is mocked here to return undefined for
  // a member exactly as it would for a total stranger, proving the route
  // itself cannot distinguish "member" from "no access" for this operation.
  it("given a mere member (not owner), when attempting to rename, then it returns 404 and does not update", async () => {
    authMock.mockResolvedValue({ user: { id: "member-1" } });
    getOwnedListMock.mockResolvedValue(undefined); // member is not the owner

    const res = await PATCH(patchRequest({ name: "Hijacked" }), ctx());

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/lists/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    deleteMock.mockReset();
    getOwnedListMock.mockReset();
  });

  // Given/When/Then: PLAN.md acceptance criterion — "Given a list owner,
  // when they ... delete their list, then the change is persisted."
  it("given the list owner, when deleting, then it deletes and returns 204", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(sampleList);
    deleteMock.mockReturnValue(makeDeleteChain());

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalled();
  });

  // Given/When/Then: "... a non-owner attempting the same action is
  // rejected" — 404, not 403.
  it("given a non-owner, when attempting to delete, then it returns 404 and does not delete", async () => {
    authMock.mockResolvedValue({ user: { id: "not-the-owner" } });
    getOwnedListMock.mockResolvedValue(undefined);

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("given a nonexistent list, when attempting to delete, then it returns 404", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(undefined);

    const res = await DELETE(deleteRequest(), ctx("nonexistent-id"));

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("given no session, when attempting to delete, then it returns 401", async () => {
    authMock.mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(401);
    expect(getOwnedListMock).not.toHaveBeenCalled();
  });

  // Given/When/Then (Task 5 REGRESSION GUARD): a mere contributor must not
  // be able to delete the list either.
  it("given a mere member (not owner), when attempting to delete, then it returns 404 and does not delete", async () => {
    authMock.mockResolvedValue({ user: { id: "member-1" } });
    getOwnedListMock.mockResolvedValue(undefined);

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
