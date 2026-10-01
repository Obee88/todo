"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Open/closed state of a list's sharing panel, shared between the share
// icon in ListControls (header) and MembersPanel (rendered further down,
// in a different part of the layout). Hidden by default.
//
// # DECISION: a tiny context provider wrapped around each list's markup by
// the (server) page/column, rather than lifting both components into one
// client component — rationale: the header and the panel sit in different
// layout slots (the panel is inside a board column's scroll area), so a
// shared context keeps both pages' existing server-rendered layout intact.
// Reversal cost: low.
const ShareToggleContext = createContext<{
  open: boolean;
  toggle: () => void;
} | null>(null);

export function ShareToggleProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ShareToggleContext.Provider
      value={{ open, toggle: () => setOpen((o) => !o) }}
    >
      {children}
    </ShareToggleContext.Provider>
  );
}

export function useShareToggle() {
  return useContext(ShareToggleContext);
}
