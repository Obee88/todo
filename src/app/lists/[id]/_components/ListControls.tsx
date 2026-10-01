"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ListLike = { id: string; name: string };

// PLAN.md Section 3: "PATCH /api/lists/[id] ... { name } -> renames list."
// "DELETE /api/lists/[id] ... Deletes list (cascade items + members)."
// Both owner-only; a non-owner should never see these controls (and the
// route itself also enforces owner-only + 404, so this is UX gating, not
// the security boundary).
//
// # DECISION: fetch() to PATCH/DELETE /api/lists/[id], same convention as
// CreateListForm / the auth pages — rationale: consistent mutation pattern
// across the app (see src/app/page.tsx's DECISION comment). Alternatives
// considered: Server Actions colocated in this file (rejected for the same
// consistency reason). Reversal cost: low.
// `compact` renders the header for a column on the home-page board: a
// smaller h2 that links through to the full /lists/[id] page, instead of
// the detail page's h1.
export default function ListControls({
  list,
  isOwner,
  compact = false,
}: {
  list: ListLike;
  isOwner: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        setRenaming(false);
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not rename list.");
    } catch {
      setError("Could not rename list.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${list.name}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
      if (res.status === 204) {
        router.push("/");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not delete list.");
    } catch {
      setError("Could not delete list.");
    } finally {
      setSubmitting(false);
    }
  }

  const title = compact ? (
    <h2 className="min-w-0 truncate text-lg font-semibold">
      <Link href={`/lists/${list.id}`} className="hover:underline">
        {list.name}
      </Link>
    </h2>
  ) : (
    <h1 className="min-w-0 truncate text-2xl font-semibold">{list.name}</h1>
  );

  if (!isOwner) {
    return title;
  }

  return (
    <div className="space-y-3">
      {renaming ? (
        <form
          onSubmit={handleRename}
          className="flex flex-wrap items-center gap-2"
        >
          <label htmlFor={`rename-list-${list.id}`} className="sr-only">
            List name
          </label>
          <input
            id={`rename-list-${list.id}`}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`min-w-0 flex-1 basis-full rounded border border-gray-300 px-3 py-2 font-semibold sm:basis-auto ${
              compact ? "text-base" : "text-xl"
            }`}
          />
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setName(list.name);
              setRenaming(false);
              setError(null);
            }}
            className="shrink-0 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-4">
          {title}
          <div className="flex shrink-0 gap-3 text-sm">
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="-m-1 p-1 text-gray-500 underline hover:text-gray-700"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="-m-1 p-1 text-red-600 underline hover:text-red-800 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
