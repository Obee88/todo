"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type MemberLike = {
  userId: string;
  email: string;
  name: string | null;
};

// PLAN.md Section 3: "POST /api/lists/[id]/members | required, owner-only |
// { email } -> adds list_member if a user with that email exists; 404 if
// not." / "DELETE /api/lists/[id]/members/[userId] | required, owner-only |
// Removes a contributor." Rendered only for the list owner (see
// src/app/lists/[id]/page.tsx — `isOwner` gate); the routes themselves also
// enforce owner-only + 404, so this is UX gating, not the security
// boundary, matching the existing ListControls convention.
//
// # DECISION: client component with fetch() to the members routes, same
// convention as ListControls / CreateListForm / AddItemForm — see
// src/app/page.tsx's DECISION comment for the app-wide rationale. Reversal
// cost: low.
export default function MembersPanel({
  listId,
  members,
}: {
  listId: string;
  members: MemberLike[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lists/${listId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setEmail("");
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not invite that user.");
    } catch {
      setError("Could not invite that user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(userId: string) {
    setError(null);
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/lists/${listId}/members/${userId}`, {
        method: "DELETE",
      });
      if (res.status === 204) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not remove that member.");
    } catch {
      setError("Could not remove that member.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="space-y-3 border-t border-gray-200 pt-6">
      <h2 className="text-lg font-semibold">Sharing</h2>

      {members.length === 0 ? (
        <p className="text-sm text-gray-500">
          This list isn&apos;t shared with anyone yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {member.name ? `${member.name} · ` : ""}
                {member.email}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(member.userId)}
                disabled={removingId === member.userId}
                className="-m-1 shrink-0 p-1 text-red-600 underline hover:text-red-800 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleInvite} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <label htmlFor="invite-email" className="sr-only">
            Invite by email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            placeholder="Invite by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          className="w-full rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50 sm:w-auto"
        >
          {submitting ? "Inviting..." : "Invite"}
        </button>
      </form>
    </section>
  );
}
