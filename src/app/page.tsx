import Link from "next/link";

import { auth, signOut } from "@/auth";
import { getMemberLists, getOwnedLists } from "@/lib/lists";
import CreateListForm from "./_components/CreateListForm";

// PLAN.md Section 3 Interfaces: "/ | page | required | Lists the user's own
// lists + lists shared with them." Task 5 wires up the "shared with them"
// half (owned-only was Task 3's interim state).
//
// # DECISION: server component that fetches owned lists and member lists as
// two separate queries (getOwnedLists + getMemberLists) rendered as two
// sections, rather than one combined/deduped query — rationale: PLAN.md's
// data model explicitly keeps ownership and membership as distinct
// relationships (the owner is never duplicated into list_member), so "your
// lists" vs "shared with you" is a natural, spec-faithful UI split that
// needs no client-side merging or dedup logic (a list can never appear in
// both sets, since owners are never members of their own list per the data
// model invariant). The create-list *form* stays extracted into a small
// client component (CreateListForm) that POSTs to /api/lists — rationale
// carried over from Task 3: the page itself needs no interactivity beyond
// the form and the sign-out button, so keeping it a server component avoids
// shipping unnecessary client JS for the list-rendering path. Alternatives
// considered: a single `getAccessibleLists` returning a `{ list, isOwner }`
// shape (rejected — see src/lib/lists.ts's getMemberLists DECISION for the
// full reasoning: two simple queries stay easier to test and reason about
// than one UNION/join-then-dedupe). Reversal cost: low.
export default async function HomePage() {
  const session = await auth();
  const userId = session!.user!.id as string;
  const [ownedLists, memberLists] = await Promise.all([
    getOwnedLists(userId),
    getMemberLists(userId),
  ]);

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Your lists</h1>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              Sign out
            </button>
          </form>
        </div>

        <CreateListForm />

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Owned by you
          </h2>
          {ownedLists.length === 0 ? (
            <p className="text-sm text-gray-500">
              You don&apos;t have any lists yet. Create one above.
            </p>
          ) : (
            <ul className="space-y-2">
              {ownedLists.map((list) => (
                <li key={list.id}>
                  <Link
                    href={`/lists/${list.id}`}
                    className="block rounded border border-gray-200 px-4 py-3 hover:border-gray-400"
                  >
                    {list.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {memberLists.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Shared with you
            </h2>
            <ul className="space-y-2">
              {memberLists.map((list) => (
                <li key={list.id}>
                  <Link
                    href={`/lists/${list.id}`}
                    className="block rounded border border-gray-200 px-4 py-3 hover:border-gray-400"
                  >
                    {list.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
