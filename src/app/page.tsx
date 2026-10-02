import { auth } from "@/auth";
import { getListMembers, getMemberLists, getOwnedLists } from "@/lib/lists";
import { getSortedListItems } from "@/lib/items";
import CreateListForm from "./_components/CreateListForm";
import ListColumn from "./_components/ListColumn";
import AppHeader from "./_components/AppHeader";

// PLAN.md Section 3 Interfaces: "/ | page | required | Lists the user's own
// lists + lists shared with them." Task 5 wires up the "shared with them"
// half (owned-only was Task 3's interim state). Lists are rendered as a
// full-width board, one fully interactive column per list (see ListColumn),
// rather than a list of links to /lists/[id].
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

  // Board view: every list is rendered in full as its own column, so each
  // column needs its items (and, for owned lists, its members) up front.
  // Owned lists come first, then lists shared with the user.
  const columns = await Promise.all([
    ...ownedLists.map(async (list) => ({
      list,
      isOwner: true,
      items: await getSortedListItems(list.id),
      members: await getListMembers(list.id),
    })),
    ...memberLists.map(async (list) => ({
      list,
      isOwner: false,
      items: await getSortedListItems(list.id),
      members: [],
    })),
  ]);

  // # DECISION: the page is exactly one viewport tall (h-dvh) with the board
  // as the only flex-1 region; the board scrolls horizontally and each
  // column scrolls vertically on its own (see ListColumn), so the page
  // itself never scrolls and lists don't scroll together. Reversal cost:
  // low.
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader>
        <CreateListForm />
      </AppHeader>

      <main className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        {columns.length === 0 ? (
          <p className="text-sm text-gray-500">
            You don&apos;t have any lists yet. Create one above.
          </p>
        ) : (
          <div className="-mx-4 flex min-h-0 flex-1 snap-x items-start gap-4 overflow-x-auto overflow-y-hidden px-4 pb-2 sm:-mx-6 sm:px-6">
            {columns.map((column) => (
              <ListColumn key={column.list.id} {...column} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
