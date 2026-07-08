"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type ItemLike = {
  id: string;
  title: string;
  done: boolean;
  position: number;
};

// PLAN.md Section 3 Interfaces: "PATCH /api/lists/[id]/items/[itemId] ...
// { title?, done? } -> updates item." / "DELETE ... Deletes item."
// Sort rule (Section 3): "undone items before done items, each group in
// stable creation order" — the caller (src/app/lists/[id]/page.tsx) passes
// `items` already sorted via src/lib/items.ts's getSortedListItems, so this
// component renders in the order it receives, it does not re-sort.
//
// # DECISION: render in the exact order given by the server (no client-side
// re-sort) — rationale: the server-side query is the single source of truth
// for the sort rule (src/lib/items.ts); re-sorting again here would either
// duplicate that logic (drift risk) or, if done naively while items are
// being toggled optimistically, could contradict the "moves to the correct
// group on next render" acceptance criterion, which is explicitly phrased
// in terms of the *next render* (i.e., a fresh server fetch), not an
// instant client-side re-order. Alternatives considered: optimistically
// re-sort in state on toggle (rejected — out of scope for what the
// acceptance criteria ask for, and adds a second sort implementation to
// keep in sync). Reversal cost: low.
export default function ItemList({
  listId,
  items,
}: {
  listId: string;
  items: ItemLike[];
}) {
  const router = useRouter();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  function setPending(id: string, pending: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function patchItem(id: string, body: { title?: string; done?: boolean }) {
    setError(null);
    setPending(id, true);
    try {
      const res = await fetch(`/api/lists/${listId}/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.refresh();
        return true;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not update item.");
      return false;
    } catch {
      setError("Could not update item.");
      return false;
    } finally {
      setPending(id, false);
    }
  }

  async function handleToggle(item: ItemLike) {
    // # DECISION: send only `{ done: !item.done }`, never `title` or
    // `position` — proves the "toggling done never changes position" rule
    // holds at the client call site too, not just server-side (see the
    // route's own DECISION comment on why `position` isn't even in its
    // schema).
    await patchItem(item.id, { done: !item.done });
  }

  async function handleDelete(item: ItemLike) {
    setError(null);
    setPending(item.id, true);
    try {
      const res = await fetch(`/api/lists/${listId}/items/${item.id}`, {
        method: "DELETE",
      });
      if (res.status === 204) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not delete item.");
    } catch {
      setError("Could not delete item.");
    } finally {
      setPending(item.id, false);
    }
  }

  function startEditing(item: ItemLike) {
    setEditingId(item.id);
    setEditTitle(item.title);
  }

  async function handleEditSubmit(e: FormEvent<HTMLFormElement>, item: ItemLike) {
    e.preventDefault();
    const ok = await patchItem(item.id, { title: editTitle });
    if (ok) setEditingId(null);
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No items yet — add one below.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <ul className="divide-y divide-gray-200">
        {items.map((item) => {
          const isPending = pendingIds.has(item.id);
          const isEditing = editingId === item.id;
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 py-2"
              data-done={item.done}
            >
              <input
                type="checkbox"
                checked={item.done}
                disabled={isPending}
                onChange={() => handleToggle(item)}
                aria-label={`Mark "${item.title}" as ${item.done ? "not done" : "done"}`}
                className="h-4 w-4"
              />
              {isEditing ? (
                <form
                  onSubmit={(e) => handleEditSubmit(e, item)}
                  className="flex flex-1 items-center gap-2"
                >
                  <label htmlFor={`edit-item-${item.id}`} className="sr-only">
                    Item title
                  </label>
                  <input
                    id={`edit-item-${item.id}`}
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span
                    className={`flex-1 text-sm ${
                      item.done ? "text-gray-400 line-through" : "text-gray-900"
                    }`}
                  >
                    {item.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEditing(item)}
                    disabled={isPending}
                    className="text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={isPending}
                    className="text-xs text-red-600 underline hover:text-red-800 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
