"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import IconButton from "@/app/_components/IconButton";
import { PlusIcon, UserMinusIcon } from "@/app/_components/icons";
import { useShareToggle } from "./ShareToggle";

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

  // Hidden until the share icon in the list header is toggled; open/close
  // animates height (grid-rows 0fr ↔ 1fr) plus a fade/slide. `inert` keeps
  // the collapsed panel's inputs out of the tab order.
  const open = useShareToggle()?.open ?? true;

  return (
    <div
      inert={!open}
      className={`grid transition-all duration-300 ease-out ${
        open
          ? "grid-rows-[1fr] opacity-100"
          : "grid-rows-[0fr] -translate-y-1 opacity-0"
      }`}
    >
    <div className="min-h-0 overflow-hidden">
    <section className="mt-6 space-y-3 border-t border-gray-200 pt-4">
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
              className={`flex items-center justify-between gap-3 rounded border border-gray-200 py-1 pl-3 pr-1 text-sm transition-opacity duration-200 motion-safe:animate-row-in ${
                removingId === member.userId ? "opacity-40" : ""
              }`}
            >
              <span className="min-w-0 truncate">
                {member.name ? `${member.name} · ` : ""}
                {member.email}
              </span>
              <IconButton
                label="Remove from list"
                tone="red"
                icon={<UserMinusIcon />}
                onClick={() => handleRemove(member.userId)}
                disabled={removingId === member.userId}
              />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleInvite} className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <label htmlFor={`invite-email-${listId}`} className="sr-only">
            Invite by email
          </label>
          <input
            id={`invite-email-${listId}`}
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
        <div className="pt-1">
          <IconButton
            type="submit"
            label="Invite"
            tone="green"
            icon={<PlusIcon />}
            disabled={submitting}
          />
        </div>
      </form>
    </section>
    </div>
    </div>
  );
}
