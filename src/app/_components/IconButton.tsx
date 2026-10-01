"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Tone = "green" | "red" | "amber" | "gray";

const TONES: Record<Tone, string> = {
  green: "text-green-600 hover:bg-green-100 hover:text-green-700 focus-visible:ring-green-500",
  red: "text-red-600 hover:bg-red-100 hover:text-red-700 focus-visible:ring-red-500",
  amber: "text-amber-600 hover:bg-amber-100 hover:text-amber-700 focus-visible:ring-amber-500",
  gray: "text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus-visible:ring-gray-400",
};

const ACTIVE: Record<Tone, string> = {
  green: "bg-green-100",
  red: "bg-red-100",
  amber: "bg-amber-100",
  gray: "bg-gray-200",
};

// Icon-only action button with a hover/focus tooltip.
//
// # DECISION: the tooltip is portalled to <body> with position:fixed,
// computed from the button's rect on hover/focus, rather than a CSS-only
// absolutely-positioned child — rationale: buttons live inside each board
// column's `overflow-y-auto` scroll area, which would clip an absolutely
// positioned tooltip on the first/last rows. `label` doubles as the
// accessible name (aria-label), so screen readers don't depend on the
// tooltip. Reversal cost: low.
export default function IconButton({
  label,
  tone,
  icon,
  onClick,
  disabled,
  type = "button",
  pressed,
}: {
  label: string;
  tone: Tone;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  pressed?: boolean;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; below: boolean } | null>(
    null
  );

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
    setTip({ x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
  }

  return (
    <>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setTip(null)}
        className={`inline-flex shrink-0 items-center justify-center rounded-md p-1.5 transition duration-150 ease-out hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40 ${TONES[tone]} ${
          pressed ? ACTIVE[tone] : ""
        }`}
      >
        {icon}
      </button>
      {tip &&
        createPortal(
          <span
            role="tooltip"
            style={{
              left: tip.x,
              top: tip.y,
              translate: tip.below ? undefined : "0 -100%",
            }}
            className="pointer-events-none fixed z-50 -translate-x-1/2 animate-tooltip-in whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
          >
            {label}
          </span>,
          document.body
        )}
    </>
  );
}
