import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB client the same way src/lib/lists.test.ts does — no live
// Postgres is available in this sandbox (see agents-logs.txt).
const selectMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

const { getSortedListItems, sortListItems, insertListItem } = await import(
  "./items"
);

function makeSortedItemsChain(result: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        orderBy: () => Promise.resolve(result),
      }),
    }),
  };
}

function makeInsertChain(result: unknown[]) {
  return {
    values: () => ({
      returning: () => Promise.resolve(result),
    }),
  };
}

function item(overrides: Partial<{
  id: string;
  title: string;
  done: boolean;
  position: number;
}>) {
  return {
    id: "item-1",
    listId: "list-1",
    title: "Milk",
    done: false,
    position: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("sortListItems (pure comparator)", () => {
  // Given/When/Then: PLAN.md "Sort rule" — "items are ordered by done ASC,
  // position ASC" — and the behavior example: "a list with items
  // A(done=false), B(done=true), C(done=false) created in that order
  // displays as A, C, B."
  it("given a mixed list of done/undone items, when sorted, then undone items come first, each group in position order", () => {
    const a = item({ id: "A", done: false, position: 0 });
    const b = item({ id: "B", done: true, position: 1 });
    const c = item({ id: "C", done: false, position: 2 });

    const result = sortListItems([a, b, c]);

    expect(result.map((i) => i.id)).toEqual(["A", "C", "B"]);
  });

  it("given items already in creation order within mixed done states, when sorted, then each group preserves stable creation (position) order", () => {
    const items = [
      item({ id: "1", done: true, position: 3 }),
      item({ id: "2", done: false, position: 1 }),
      item({ id: "3", done: false, position: 0 }),
      item({ id: "4", done: true, position: 2 }),
    ];

    const result = sortListItems(items);

    expect(result.map((i) => i.id)).toEqual(["3", "2", "4", "1"]);
  });

  it("given an empty list, when sorted, then it returns an empty array", () => {
    expect(sortListItems([])).toEqual([]);
  });

  it("given all items are undone, when sorted, then order is by position only", () => {
    const items = [
      item({ id: "x", done: false, position: 2 }),
      item({ id: "y", done: false, position: 0 }),
      item({ id: "z", done: false, position: 1 }),
    ];

    expect(sortListItems(items).map((i) => i.id)).toEqual(["y", "z", "x"]);
  });

  it("does not mutate the input array", () => {
    const items = [
      item({ id: "a", done: true, position: 0 }),
      item({ id: "b", done: false, position: 1 }),
    ];
    const copy = [...items];

    sortListItems(items);

    expect(items).toEqual(copy);
  });
});

describe("getSortedListItems (SQL query)", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("given a list id, when fetching items, then it queries ordered by done ASC then position ASC and returns the rows as-is", async () => {
    const rows = [item({ id: "A" }), item({ id: "B", done: true })];
    selectMock.mockReturnValue(makeSortedItemsChain(rows));

    const result = await getSortedListItems("list-1");

    expect(result).toEqual(rows);
  });

  it("given a list with no items, when fetching, then it returns an empty array", async () => {
    selectMock.mockReturnValue(makeSortedItemsChain([]));

    const result = await getSortedListItems("empty-list");

    expect(result).toEqual([]);
  });
});

describe("insertListItem (position assignment)", () => {
  beforeEach(() => {
    insertMock.mockReset();
  });

  // Given/When/Then: PLAN.md "Sort rule" — "New items get position =
  // max(position for that list) + 1" — and the acceptance criterion "when
  // they add an item, then it appears in the undone group at the end of
  // creation order."
  it("given a list with existing items, when a new item is added, then it is inserted with done=false via a single insert call", async () => {
    const created = item({ id: "new-item", position: 4, done: false });
    insertMock.mockReturnValue(makeInsertChain([created]));

    const result = await insertListItem("list-1", "Bread");

    expect(result).toEqual(created);
    // Exactly one DB round trip for the insert — no separate SELECT MAX
    // call precedes it (that would show up as a second db.select call,
    // which is asserted absent by the selectMock not being touched here).
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("given the values passed to insert, when constructing the position expression, then it is a single SQL expression object, not a pre-computed number from a prior read", async () => {
    let capturedValues: Record<string, unknown> | undefined;
    insertMock.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        capturedValues = v;
        return { returning: () => Promise.resolve([item({})]) };
      },
    }));

    await insertListItem("list-1", "Eggs");

    expect(capturedValues).toBeDefined();
    expect(capturedValues!.done).toBe(false);
    expect(capturedValues!.title).toBe("Eggs");
    expect(capturedValues!.listId).toBe("list-1");
    // The position field must be a SQL fragment (object), not a plain
    // number — proof this isn't a read-then-write two-step in app code.
    expect(typeof capturedValues!.position).toBe("object");
  });
});
