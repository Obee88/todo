import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth(), the access-check helper, and insertListItem. Route-level
// authorization/validation branching is what's under test here — the
// position-assignment query itself is covered in src/lib/items.test.ts.
const authMock = vi.fn();
const getAccessibleListMock = vi.fn();
const insertListItemMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

vi.mock("@/lib/lists", () => ({
  getAccessibleList: (...args: unknown[]) => getAccessibleListMock(...args),
}));

vi.mock("@/lib/items", () => ({
  insertListItem: (...args: unknown[]) => insertListItemMock(...args),
}));

const { POST } = await import("./route");

function postRequest(body: unknown) {
  return new Request("http://localhost/api/lists/list-1/items", {
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

const sampleItem = {
  id: "item-1",
  listId: "list-1",
  title: "Milk",
  done: false,
  position: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/lists/[id]/items", () => {
  beforeEach(() => {
    authMock.mockReset();
    getAccessibleListMock.mockReset();
    insertListItemMock.mockReset();
  });

  // Given/When/Then: PLAN.md acceptance criterion — "Given a list the user
  // can access, when they add an item, then it appears in the undone group
  // at the end of creation order."
  it("given access to the list, when adding an item, then it inserts and returns 201 with the created item", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList);
    insertListItemMock.mockResolvedValue(sampleItem);

    const res = await POST(postRequest({ title: "Milk" }), ctx());

    expect(res.status).toBe(201);
    const body = await res.json();
    // NextResponse.json() serializes through JSON, turning Date objects
    // into ISO strings — compare against the JSON-round-tripped shape.
    expect(body).toEqual(JSON.parse(JSON.stringify(sampleItem)));
    expect(insertListItemMock).toHaveBeenCalledWith("list-1", "Milk");
  });

  // Given/When/Then: access-control rule — 404, not 403, for lists the
  // caller cannot access (owner-only today; reuses getAccessibleList as-is
  // per this task's instruction not to reimplement access-checking).
  it("given no access to the list (non-owner), when adding an item, then it returns 404 and does not insert", async () => {
    authMock.mockResolvedValue({ user: { id: "not-the-owner" } });
    getAccessibleListMock.mockResolvedValue(undefined);

    const res = await POST(postRequest({ title: "Milk" }), ctx());

    expect(res.status).toBe(404);
    expect(insertListItemMock).not.toHaveBeenCalled();
  });

  it("given a nonexistent list, when adding an item, then it returns 404 (same as no-access)", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    getAccessibleListMock.mockResolvedValue(undefined);

    const res = await POST(postRequest({ title: "Milk" }), ctx("nonexistent"));

    expect(res.status).toBe(404);
    expect(insertListItemMock).not.toHaveBeenCalled();
  });

  it("given no session, when adding an item, then it returns 401", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(postRequest({ title: "Milk" }), ctx());

    expect(res.status).toBe(401);
    expect(getAccessibleListMock).not.toHaveBeenCalled();
    expect(insertListItemMock).not.toHaveBeenCalled();
  });

  it("given a blank title, when adding an item, then it returns 400 and does not insert", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });

    const res = await POST(postRequest({ title: "" }), ctx());

    expect(res.status).toBe(400);
    expect(getAccessibleListMock).not.toHaveBeenCalled();
    expect(insertListItemMock).not.toHaveBeenCalled();
  });

  it("given a missing title, when adding an item, then it returns 400", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });

    const res = await POST(postRequest({}), ctx());

    expect(res.status).toBe(400);
    expect(insertListItemMock).not.toHaveBeenCalled();
  });

  it("given invalid JSON, when adding an item, then it returns 400", async () => {
    authMock.mockResolvedValue({ user: { id: "owner-1" } });

    const badReq = new Request("http://localhost/api/lists/list-1/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await POST(badReq, ctx());

    expect(res.status).toBe(400);
    expect(insertListItemMock).not.toHaveBeenCalled();
  });

  // Given/When/Then (Task 5): PLAN.md acceptance criterion — an invited
  // contributor (list_member, not owner) "can view/add/edit/check/delete
  // items." This route reuses getAccessibleList unchanged (owner OR member
  // as of Task 5), so a mere member must be granted access here, not
  // rejected — the opposite regression direction from the owner-only routes.
  it("given a mere member (not owner) has access via getAccessibleList, when adding an item, then it inserts and returns 201", async () => {
    authMock.mockResolvedValue({ user: { id: "member-1" } });
    getAccessibleListMock.mockResolvedValue(sampleList); // member now passes
    insertListItemMock.mockResolvedValue(sampleItem);

    const res = await POST(postRequest({ title: "Milk" }), ctx());

    expect(res.status).toBe(201);
    expect(insertListItemMock).toHaveBeenCalledWith("list-1", "Milk");
  });
});
