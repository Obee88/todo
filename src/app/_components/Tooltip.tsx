"use client";

import { useEffect, useState, type FocusEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";

// Shared hover/focus tooltip for icon buttons and icon links.
//
// # DECISION: portalled to <body> with position:fixed, computed from the
// trigger's rect — rationale: triggers live inside each board column's
// `overflow-y-auto` scroll area, which would clip an absolutely positioned
// tooltip on the first/last rows. Shown only for a real mouse hover or
// keyboard focus (`:focus-visible`), never for touch — on phones a tap
// would otherwise flash the tooltip right before the action fires.
// Reversal cost: low.
type Tip = { x: number; y: number; below: boolean };

// Tooltips are at most this wide (see max-w below); keep their centre at
// least half that far from the viewport edges so they never overflow.
const MAX_HALF_WIDTH = 160;
const EDGE = 8;

export function useTooltip(label: string, { wrap = false } = {}) {
  const [tip, setTip] = useState<Tip | null>(null);

  // A fixed-position tooltip would be left behind if anything scrolls
  // (the board or a column), so hide it on any scroll while shown.
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
  }, [tip]);

  function show(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const below = r.top < 36;
    const half = Math.min(MAX_HALF_WIDTH, window.innerWidth / 2 - EDGE);
    const x = Math.min(
      Math.max(r.left + r.width / 2, half + EDGE),
      window.innerWidth - half - EDGE
    );
    setTip({ x, y: below ? r.bottom + 6 : r.top - 6, below });
  }

  const handlers = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") show(e.currentTarget);
    },
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
    },
    onBlur: () => setTip(null),
  };

  const tooltip =
    tip &&
    createPortal(
      <span
        role="tooltip"
        style={{
          left: tip.x,
          top: tip.y,
          translate: tip.below ? undefined : "0 -100%",
        }}
        className={`pointer-events-none fixed z-50 max-w-[20rem] -translate-x-1/2 animate-tooltip-in rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg ${
          wrap ? "break-all" : "whitespace-nowrap"
        }`}
      >
        {label}
      </span>,
      document.body
    );

  return { handlers, tooltip, hide: () => setTip(null) };
}
