"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// PLAN.md Section 3 Interfaces: "POST /api/lists/[id]/items ... { title } ->
// appends item at end of undone group." Same client-fetch convention as
// CreateListForm / ListControls (see those files' DECISION comments) —
// consistent mutation pattern across the app rather than a Server Action.
export default function AddItemForm({ listId }: { listId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (res.ok) {
        setTitle("");
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not add item.");
    } catch {
      setError("Could not add item.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <label htmlFor="new-item-title" className="sr-only">
        New item title
      </label>
      <input
        id="new-item-title"
        type="text"
        required
        placeholder="Add an item…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        Add
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
