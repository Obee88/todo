import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const deleteMock = vi.fn();
const getOwnedListMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

vi.mock("@/lib/lists", () => ({
  getOwnedList: (...args: unknown[]) => getOwnedListMock(...args),
}));

const { DELETE } = await import("./route");

function deleteRequest() {
  return new Request(
    "http://localhost/api/lists/list-1/members/member-1",
    { method: "DELETE" }
  );
}

function ctx(id = "list-1", userId = "member-1") {
  return { params: Promise.resolve({ id, userId }) };
}

const sampleList = {
  id: "list-1",
  name: "Groceries",
  ownerId: "owner-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeDeleteChain(result: unknown[]) {
  return {
    where: () => ({
      returning: () => Promise.resolve(result),
    }),
  };
}

describe("DELETE /api/lists/[id]/members/[userId]", () => {
  beforeEach(() => {
    authMock.mockReset();
    deleteMock.mockReset();
    getOwnedListMock.mockReset();
  });

  // Given/When/Then: PLAN.md interface — owner-only, "Removes a
  // contributor."
  it("given the owner removes a member, when deleting, then it deletes the list_member row and returns 204", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(sampleList);
    deleteMock.mockReturnValue(
      makeDeleteChain([{ listId: "list-1", userId: "member-1" }])
    );

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(204);
    expect(deleteMock).toHaveBeenCalled();
  });

  // Given/When/Then (Task 5 REGRESSION GUARD): only the owner may remove
  // members — a non-owner (including a mere member trying to remove
  // someone, or themselves) gets 404.
  it("given a non-owner, when attempting to remove a member, then it returns 404 and does not delete", async () => {
    authMock.mockResolvedValue({ user: { id: "not-the-owner" } });
    getOwnedListMock.mockResolvedValue(undefined);

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("given a mere member (not owner) tries to remove another member, then it returns 404", async () => {
    authMock.mockResolvedValue({ user: { id: "member-2" } });
    getOwnedListMock.mockResolvedValue(undefined); // member-2 is not owner

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("given a nonexistent list, when attempting to remove a member, then it returns 404", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(undefined);

    const res = await DELETE(deleteRequest(), ctx("nonexistent"));

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("given the target user is not actually a member, when deleting, then it returns 404 (delete affects zero rows)", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getOwnedListMock.mockResolvedValue(sampleList);
    deleteMock.mockReturnValue(makeDeleteChain([]));

    const res = await DELETE(deleteRequest(), ctx("list-1", "not-a-member"));

    expect(res.status).toBe(404);
  });

  it("given no session, when attempting to remove a member, then it returns 401", async () => {
    authMock.mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(401);
    expect(getOwnedListMock).not.toHaveBeenCalled();
  });
});
