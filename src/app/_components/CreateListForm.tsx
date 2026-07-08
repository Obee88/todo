"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// PLAN.md Section 3: "POST /api/lists | POST | required | { name } ->
// creates list, current user becomes owner."
//
// # DECISION: client component posting to /api/lists via fetch(), mirroring
// the /register page's pattern (see src/app/register/page.tsx's DECISION
// comment) rather than a Server Action — see src/app/page.tsx's DECISION
// comment for the full rationale (consistency with Task 2's established
// convention; /api/lists is itself a required, independently specified
// interface). Reversal cost: low.
export default function CreateListForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.status === 201) {
        setName("");
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not create list. Please try again.");
    } catch {
      setError("Could not create list. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <div className="flex-1">
        <label htmlFor="list-name" className="sr-only">
          List name
        </label>
        <input
          id="list-name"
          name="name"
          type="text"
          required
          placeholder="New list name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="block w-full rounded border border-gray-300 px-3 py-2"
        />
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create list"}
      </button>
    </form>
  );
}
