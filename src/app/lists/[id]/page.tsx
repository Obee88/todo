import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { getAccessibleList, getListMembers } from "@/lib/lists";
import { getSortedListItems } from "@/lib/items";
import ListControls from "./_components/ListControls";
import ItemList from "./_components/ItemList";
import AddItemForm from "./_components/AddItemForm";
import MembersPanel from "./_components/MembersPanel";

// PLAN.md Section 3 Interfaces: "/lists/[id] | page | required (access
// check) | List detail: items (sorted), add-item form, member list, invite
// form (owner only), rename/delete controls (owner only)."
//
// # DECISION: use next/navigation's notFound() (renders the App Router's
// not-found boundary, HTTP 404) when getAccessibleList() returns undefined
// — rationale: this is the page-level equivalent of the API routes' "404,
// not 403" rule from PLAN.md's access-control section; a user with no
// relationship to the list must see the same "not found" outcome whether
// the list doesn't exist or they simply lack access, so there is exactly
// one failure branch here, matching the helper's own undefined-for-both
// contract (see src/lib/lists.ts). Alternatives considered: redirect to `/`
// with a flash message (rejected — PLAN.md's behavior example is explicit:
// "a user with no relationship to list L requesting /lists/L ... gets a
// 404," not a redirect). Reversal cost: low.
type PageProps = { params: Promise<{ id: string }> };

export default async function ListDetailPage({ params }: PageProps) {
  const { id } = await params;

  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    // Unreachable in practice — middleware already redirects unauthenticated
    // requests to /login before this page renders — but keeps this page
    // correct in isolation (e.g. if middleware's matcher ever changes).
    notFound();
  }

  // getAccessibleList now matches owner OR member (Task 5) — a mere
  // contributor reaches this page too, per the acceptance criterion "that
  // user gains contributor access (visible on their /, can view/add/edit/
  // check/delete items)."
  const list = await getAccessibleList(userId, id);
  if (!list) {
    notFound();
  }

  // # DECISION: compute `isOwner` by comparing `list.ownerId` to the
  // session user directly, rather than a second DB round-trip via
  // `isListOwner` — `getAccessibleList` already returned the list row
  // (including `ownerId`) in the same query that established access, so
  // this comparison is free and exactly equivalent to `isListOwner` (both
  // ultimately check `lists.owner_id = userId`). This is what gates
  // rename/delete (ListControls) and the members panel/invite form
  // (MembersPanel) to owner-only, satisfying "only the owner can
  // rename/delete the list or manage sharing." Alternatives considered:
  // call `isListOwner(userId, id)` separately (rejected — redundant query,
  // same result, since `list.ownerId` is already in hand). Reversal cost:
  // low.
  const isOwner = list.ownerId === userId;

  // Items sorted server-side per PLAN.md's "Sort rule" (done ASC, position
  // ASC — see src/lib/items.ts) so the initial render is correct with no
  // client-side re-sort. Access-checked implicitly: reaching this line
  // already required passing getAccessibleList above.
  const items = await getSortedListItems(id);

  // Members panel + invite form are owner-only UI (PLAN.md: "member list,
  // invite form (owner only)"). The members list itself is only fetched for
  // owners — a mere member doesn't need (and per the spec shouldn't manage)
  // the contributor roster.
  const members = isOwner ? await getListMembers(id) : [];

  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8">
      <div className="w-full max-w-lg space-y-8">
        <ListControls list={list} isOwner={isOwner} />

        <div className="space-y-4">
          <ItemList listId={id} items={items} />
          <AddItemForm listId={id} />
        </div>

        {isOwner && <MembersPanel listId={id} members={members} />}
      </div>
    </main>
  );
}
