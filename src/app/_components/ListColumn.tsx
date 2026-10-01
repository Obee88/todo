import ListControls from "../lists/[id]/_components/ListControls";
import ItemList from "../lists/[id]/_components/ItemList";
import AddItemForm from "../lists/[id]/_components/AddItemForm";
import MembersPanel from "../lists/[id]/_components/MembersPanel";
import type { ListRow, ListMemberRow } from "@/lib/lists";
import type { ListItemRow } from "@/lib/items";

// One column of the home-page board: the same controls as /lists/[id]
// (rename/delete, items, add-item form, sharing) squeezed into a fixed-width
// card.
//
// # DECISION: the header and add-item form stay pinned while only the
// middle section (items + sharing) scrolls, via `min-h-0 flex-1
// overflow-y-auto` inside a full-height flex column — so scrolling inside
// one column moves just that list, never the page or its neighbours, and
// adding an item never requires scrolling down a long list first.
// Reversal cost: low.
export default function ListColumn({
  list,
  items,
  isOwner,
  members,
}: {
  list: ListRow;
  items: ListItemRow[];
  isOwner: boolean;
  members: ListMemberRow[];
}) {
  return (
    <section className="flex max-h-full w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-lg border border-gray-200 bg-gray-50 sm:w-80">
      <div className="space-y-3 border-b border-gray-200 p-3">
        <ListControls list={list} isOwner={isOwner} compact />
        {!isOwner && (
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Shared with you
          </p>
        )}
        <AddItemForm listId={list.id} />
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-3">
        <ItemList listId={list.id} items={items} />
        {isOwner && <MembersPanel listId={list.id} members={members} />}
      </div>
    </section>
  );
}
