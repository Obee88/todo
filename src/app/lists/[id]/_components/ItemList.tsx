"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import IconButton from "@/app/_components/IconButton";
import {
  CheckIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon,
  XIcon,
} from "@/app/_components/icons";

type ItemLike = {
  id: string;
  title: string;
  done: boolean;
  inProgress: boolean;
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
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  function setPending(id: string, pending: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function patchItem(
    id: string,
    body: { title?: string; done?: boolean; inProgress?: boolean }
  ) {
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

  function setRemoving(id: string, removing: boolean) {
    setRemovingIds((prev) => {
      const next = new Set(prev);
      if (removing) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // The row starts collapsing immediately (optimistic) while the DELETE is
  // in flight; it stays collapsed until router.refresh() drops it, or
  // springs back if the delete fails.
  async function handleDelete(item: ItemLike) {
    setError(null);
    setPending(item.id, true);
    setRemoving(item.id, true);
    try {
      const res = await fetch(`/api/lists/${listId}/items/${item.id}`, {
        method: "DELETE",
      });
      if (res.status === 204) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      setRemoving(item.id, false);
      setError(data?.error ?? "Could not delete item.");
    } catch {
      setRemoving(item.id, false);
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
      <p className="animate-fade-in text-sm text-gray-400">
        No items yet.
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
          const isRemoving = removingIds.has(item.id);
          return (
            // Outer li animates in on mount and collapses (grid-rows 1fr →
            // 0fr + fade) while a delete is in flight; the inner wrapper's
            // overflow-hidden is what lets the row shrink to zero height.
            <li
              key={item.id}
              className={`grid transition-all duration-200 ease-out motion-safe:animate-row-in ${
                isRemoving
                  ? "pointer-events-none grid-rows-[0fr] opacity-0"
                  : "grid-rows-[1fr] opacity-100"
              }`}
              data-done={item.done}
              data-in-progress={item.inProgress}
            >
            <div className="min-h-0 overflow-hidden">
            <div
              className={`flex items-center gap-2 rounded border-l-4 py-1.5 pl-2 pr-1 transition-colors duration-300 ${
                item.inProgress
                  ? "border-amber-500 bg-amber-50"
                  : "border-transparent"
              }`}
            >
              <input
                type="checkbox"
                checked={item.done}
                disabled={isPending}
                onChange={() => handleToggle(item)}
                aria-label={`Mark "${item.title}" as ${item.done ? "not done" : "done"}`}
                className="h-5 w-5 shrink-0"
              />
              {isEditing ? (
                <form
                  onSubmit={(e) => handleEditSubmit(e, item)}
                  className="flex min-w-0 flex-1 animate-fade-in items-center gap-0.5"
                >
                  <label htmlFor={`edit-item-${item.id}`} className="sr-only">
                    Item title
                  </label>
                  <input
                    id={`edit-item-${item.id}`}
                    type="text"
                    required
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mr-1 min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <IconButton
                    type="submit"
                    label="Save"
                    tone="green"
                    icon={<CheckIcon />}
                    disabled={isPending}
                  />
                  <IconButton
                    label="Cancel"
                    tone="gray"
                    icon={<XIcon />}
                    onClick={() => setEditingId(null)}
                  />
                </form>
              ) : (
                <>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      item.done
                        ? "text-gray-400 line-through"
                        : item.inProgress
                          ? "font-semibold text-gray-900"
                          : "text-gray-900"
                    }`}
                  >
                    {item.inProgress && (
                      <span className="mr-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Working on
                      </span>
                    )}
                    {item.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {!item.done && (
                      <IconButton
                        label={item.inProgress ? "Stop working on it" : "Start working on it"}
                        tone={item.inProgress ? "amber" : "green"}
                        icon={item.inProgress ? <PauseIcon /> : <PlayIcon />}
                        onClick={() =>
                          patchItem(item.id, { inProgress: !item.inProgress })
                        }
                        disabled={isPending}
                      />
                    )}
                    <IconButton
                      label="Edit item"
                      tone="green"
                      icon={<PencilIcon />}
                      onClick={() => startEditing(item)}
                      disabled={isPending}
                    />
                    <IconButton
                      label="Delete item"
                      tone="red"
                      icon={<TrashIcon />}
                      onClick={() => handleDelete(item)}
                      disabled={isPending}
                    />
                  </div>
                </>
              )}
            </div>
            </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
