import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const getAccessibleListMock = vi.fn();

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
  getAccessibleList: (...args: unknown[]) => getAccessibleListMock(...args),
}));

const { PATCH, DELETE } = await import("./route");

function makeUpdateChain(result: unknown[]) {
  return {
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: () => Promise.resolve(result),
      }),
      __values: values,
    }),
  };
}

// Variant that also captures the `set()` argument so PATCH partial-update
// tests can assert exactly which fields were written.
function makeCapturingUpdateChain(
  result: unknown[],
  onSet: (values: Record<string, unknown>) => void
) {
  return {
    set: (values: Record<string, unknown>) => {
      onSet(values);
      return {
        where: () => ({
          returning: () => Promise.resolve(result),
        }),
      };
    },
  };
}

function makeDeleteChain(result: unknown[]) {
  return {
    where: () => ({
      returning: () => Promise.resolve(result),
    }),
  };
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/lists/list-1/items/item-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request("http://localhost/api/lists/list-1/items/item-1", {
    method: "DELETE",
  });
}

function ctx(id = "list-1", itemId = "item-1") {
  return { params: Promise.resolve({ id, itemId }) };
}

const sampleList = {
  id: "list-1",
  name: "Groceries",
  ownerId: "owner-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sampleItem = {
  id: "item-1",
  listId: "list-1",
  title: "Milk",
  done: false,
  position: 3,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("PATCH /api/lists/[id]/items/[itemId]", () => {
  beforeEach(() => {
    authMock.mockReset();
    updateMock.mockReset();
    getAccessibleListMock.mockReset();
  });

  it("given access to the list, when updating only the title, then it writes only title (+ updatedAt), never done or position", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList);
    let captured: Record<string, unknown> = {};
    updateMock.mockReturnValue(
      makeCapturingUpdateChain(
        [{ ...sampleItem, title: "Oat milk" }],
        (v) => (captured = v)
      )
    );

    const res = await PATCH(patchRequest({ title: "Oat milk" }), ctx());

    expect(res.status).toBe(200);
    expect(captured).toHaveProperty("title", "Oat milk");
    expect(captured).toHaveProperty("updatedAt");
    expect(captured).not.toHaveProperty("done");
    expect(captured).not.toHaveProperty("position");
  });

  // Given/When/Then: PLAN.md acceptance criterion — "Given an item ..., when
  // they toggle its done state, then only done changes (position and order
  // within its new group by creation time are preserved)."
  it("given access to the list, when toggling done only, then it writes only done (+ updatedAt), never title or position", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList);
    let captured: Record<string, unknown> = {};
    updateMock.mockReturnValue(
      makeCapturingUpdateChain(
        [{ ...sampleItem, done: true }],
        (v) => (captured = v)
      )
    );

    const res = await PATCH(patchRequest({ done: true }), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.done).toBe(true);
    expect(body.position).toBe(sampleItem.position); // unchanged
    expect(captured).toHaveProperty("done", true);
    expect(captured).toHaveProperty("updatedAt");
    expect(captured).not.toHaveProperty("title");
    expect(captured).not.toHaveProperty("position");
  });

  it("given both title and done provided, when updating, then it writes both fields", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList);
    let captured: Record<string, unknown> = {};
    updateMock.mockReturnValue(
      makeCapturingUpdateChain(
        [{ ...sampleItem, title: "Bread", done: true }],
        (v) => (captured = v)
      )
    );

    const res = await PATCH(
      patchRequest({ title: "Bread", done: true }),
      ctx()
    );

    expect(res.status).toBe(200);
    expect(captured).toMatchObject({ title: "Bread", done: true });
  });

  it("given neither title nor done, when patching, then it returns 400 and does not update", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });

    const res = await PATCH(patchRequest({}), ctx());

    expect(res.status).toBe(400);
    expect(getAccessibleListMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("given a non-owner (no access), when patching, then it returns 404 and does not update", async () => {
    authMock.mockResolvedValue({ user: { id: "not-the-owner" } });
    getAccessibleListMock.mockResolvedValue(undefined);

    const res = await PATCH(patchRequest({ done: true }), ctx());

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("given a nonexistent list, when patching an item, then it returns 404", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(undefined);

    const res = await PATCH(patchRequest({ done: true }), ctx("nonexistent"));

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("given an item id that does not belong to the list, when patching, then it returns 404 (update affects zero rows)", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList);
    updateMock.mockReturnValue(makeUpdateChain([]));

    const res = await PATCH(patchRequest({ done: true }), ctx("list-1", "wrong-item"));

    expect(res.status).toBe(404);
  });

  it("given no session, when patching, then it returns 401", async () => {
    authMock.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ done: true }), ctx());

    expect(res.status).toBe(401);
    expect(getAccessibleListMock).not.toHaveBeenCalled();
  });

  it("given a blank title, when patching, then it returns 400", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });

    const res = await PATCH(patchRequest({ title: "" }), ctx());

    expect(res.status).toBe(400);
    expect(getAccessibleListMock).not.toHaveBeenCalled();
  });

  // Given/When/Then (Task 5): a mere member (list_member, not owner) must be
  // able to edit/check items — PLAN.md: contributor access includes
  // "add/edit/check/delete items." This route reuses getAccessibleList
  // unchanged (owner OR member as of Task 5).
  it("given a mere member (not owner) has access via getAccessibleList, when toggling done, then it updates", async () => {
    authMock.mockResolvedValue({ user: { id: "member-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList);
    updateMock.mockReturnValue(makeUpdateChain([{ ...sampleItem, done: true }]));

    const res = await PATCH(patchRequest({ done: true }), ctx());

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/lists/[id]/items/[itemId]", () => {
  beforeEach(() => {
    authMock.mockReset();
    deleteMock.mockReset();
    getAccessibleListMock.mockReset();
  });

  it("given access to the list, when deleting an item, then it deletes and returns 204", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList);
    deleteMock.mockReturnValue(makeDeleteChain([sampleItem]));

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(204);
  });

  it("given a non-owner (no access), when deleting, then it returns 404 and does not delete", async () => {
    authMock.mockResolvedValue({ user: { id: "not-the-owner" } });
    getAccessibleListMock.mockResolvedValue(undefined);

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("given a nonexistent list, when deleting an item, then it returns 404", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(undefined);

    const res = await DELETE(deleteRequest(), ctx("nonexistent"));

    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("given an item id that does not belong to the list, when deleting, then it returns 404 (delete affects zero rows)", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList);
    deleteMock.mockReturnValue(makeDeleteChain([]));

    const res = await DELETE(deleteRequest(), ctx("list-1", "wrong-item"));

    expect(res.status).toBe(404);
  });

  it("given no session, when deleting, then it returns 401", async () => {
    authMock.mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(401);
    expect(getAccessibleListMock).not.toHaveBeenCalled();
  });

  // Given/When/Then (Task 5): a mere member must be able to delete items too.
  it("given a mere member (not owner) has access via getAccessibleList, when deleting an item, then it deletes and returns 204", async () => {
    authMock.mockResolvedValue({ user: { id: "member-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList);
    deleteMock.mockReturnValue(makeDeleteChain([sampleItem]));

    const res = await DELETE(deleteRequest(), ctx());

    expect(res.status).toBe(204);
  });
});
