import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB client the same way src/app/api/register/route.test.ts does —
// no live Postgres is available in this sandbox (see agents-logs.txt), so
// getAccessibleList/isListOwner/getOwnedList/getOwnedLists/getMemberLists
// are tested against a mocked query builder.
const selectMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

const {
  getAccessibleList,
  isListOwner,
  getOwnedList,
  getOwnedLists,
  getMemberLists,
} = await import("./lists");

// getAccessibleList uses select().from().leftJoin().where().limit().
function makeAccessChain(result: unknown[]) {
  return {
    from: () => ({
      leftJoin: () => ({
        where: () => ({
          limit: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

// isListOwner / getOwnedList use select().from().where().limit() (no join).
function makeOwnerChain(result: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(result),
      }),
    }),
  };
}

function makeOwnedListsChain(result: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => Promise.resolve(result),
      }),
    }),
  };
}

// getMemberLists uses select().from().innerJoin().where().orderBy().
function makeMemberListsChain(result: unknown[]) {
  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          orderBy: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

const sampleList = {
  id: "list-1",
  name: "Groceries",
  ownerId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("getAccessibleList", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  // Given/When/Then: PLAN.md access-control rule — "A user can access list
  // L if L.owner_id = user.id" (owner branch).
  it("given the user owns the list, when checking access, then it returns the list", async () => {
    selectMock.mockReturnValue(makeAccessChain([sampleList]));

    const result = await getAccessibleList("user-1", "list-1");

    expect(result).toEqual(sampleList);
  });

  // Given/When/Then (Task 5): PLAN.md access-control rule — "... OR a
  // list_member row exists for (L.id, user.id)." This is the core Task 5
  // change: a mere member (not the owner) must now be granted access.
  it("given the user is a member (not owner) of the list, when checking access, then it returns the list", async () => {
    selectMock.mockReturnValue(makeAccessChain([sampleList]));

    const result = await getAccessibleList("member-1", "list-1");

    expect(result).toEqual(sampleList);
  });

  it("given the list does not exist, when checking access, then it returns undefined", async () => {
    selectMock.mockReturnValue(makeAccessChain([]));

    const result = await getAccessibleList("user-1", "nonexistent-list");

    expect(result).toBeUndefined();
  });

  it("given the list exists but the user is neither owner nor member, when checking access, then it returns undefined", async () => {
    // The query itself filters on ownerId = userId OR member match, so a
    // stranger's lookup yields an empty result set from the DB's
    // perspective — simulated here by returning [].
    selectMock.mockReturnValue(makeAccessChain([]));

    const result = await getAccessibleList("stranger", "list-1");

    expect(result).toBeUndefined();
  });
});

describe("isListOwner", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("given the user owns the list, when checked, then it returns true", async () => {
    selectMock.mockReturnValue(makeOwnerChain([{ id: "list-1" }]));

    await expect(isListOwner("user-1", "list-1")).resolves.toBe(true);
  });

  it("given the user does not own (or the list does not exist), when checked, then it returns false", async () => {
    selectMock.mockReturnValue(makeOwnerChain([]));

    await expect(isListOwner("user-2", "list-1")).resolves.toBe(false);
  });

  // Given/When/Then (Task 5 REGRESSION GUARD): the genuinely-owner-only
  // check must reject a mere member even though getAccessibleList (owner OR
  // member) would accept them. isListOwner queries `lists` directly on
  // owner_id, independent of getAccessibleList/list_member, so a member row
  // existing elsewhere has no bearing on this query's mocked result here —
  // this test documents/pins that isListOwner is NOT satisfied by
  // membership.
  it("given the user is only a member (not owner) of the list, when checked, then it returns false", async () => {
    selectMock.mockReturnValue(makeOwnerChain([])); // no row: not the owner

    await expect(isListOwner("member-1", "list-1")).resolves.toBe(false);
  });
});

describe("getOwnedList", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("given the user owns the list, when fetched, then it returns the list", async () => {
    selectMock.mockReturnValue(makeOwnerChain([sampleList]));

    const result = await getOwnedList("user-1", "list-1");

    expect(result).toEqual(sampleList);
  });

  // Given/When/Then (Task 5 REGRESSION GUARD): mirrors isListOwner — a mere
  // member must get undefined from getOwnedList, which is what
  // PATCH/DELETE /api/lists/[id] rely on to reject non-owners with 404.
  it("given the user is only a member (not owner), when fetched, then it returns undefined", async () => {
    selectMock.mockReturnValue(makeOwnerChain([]));

    const result = await getOwnedList("member-1", "list-1");

    expect(result).toBeUndefined();
  });

  it("given the list does not exist, when fetched, then it returns undefined", async () => {
    selectMock.mockReturnValue(makeOwnerChain([]));

    const result = await getOwnedList("user-1", "nonexistent-list");

    expect(result).toBeUndefined();
  });
});

describe("getOwnedLists", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("given a user owns multiple lists, when fetched, then all owned lists are returned", async () => {
    const secondList = { ...sampleList, id: "list-2", name: "Chores" };
    selectMock.mockReturnValue(makeOwnedListsChain([secondList, sampleList]));

    const result = await getOwnedLists("user-1");

    expect(result).toEqual([secondList, sampleList]);
  });

  it("given a user owns no lists, when fetched, then it returns an empty array", async () => {
    selectMock.mockReturnValue(makeOwnedListsChain([]));

    const result = await getOwnedLists("user-with-no-lists");

    expect(result).toEqual([]);
  });
});

describe("getMemberLists", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  // Given/When/Then (Task 5): "/" must show lists the user is a member of,
  // not just lists they own.
  it("given a user is a member of one or more lists, when fetched, then those lists are returned", async () => {
    const sharedList = { ...sampleList, id: "list-3", ownerId: "owner-2" };
    selectMock.mockReturnValue(makeMemberListsChain([sharedList]));

    const result = await getMemberLists("member-1");

    expect(result).toEqual([sharedList]);
  });

  it("given a user is not a member of any list, when fetched, then it returns an empty array", async () => {
    selectMock.mockReturnValue(makeMemberListsChain([]));

    const result = await getMemberLists("user-with-no-memberships");

    expect(result).toEqual([]);
  });
});
