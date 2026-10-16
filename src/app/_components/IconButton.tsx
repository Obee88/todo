"use client";

import type { ReactNode } from "react";

import { useTooltip } from "./Tooltip";

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

// Icon-only action button with a hover/focus tooltip (see Tooltip.tsx).
// `label` doubles as the accessible name (aria-label), so screen readers
// don't depend on the tooltip.
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
  const { handlers, tooltip } = useTooltip(label);

  return (
    <>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        {...handlers}
        className={`inline-flex shrink-0 items-center justify-center rounded-md p-1.5 transition duration-150 ease-out hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40 ${TONES[tone]} ${
          pressed ? ACTIVE[tone] : ""
        }`}
      >
        {icon}
      </button>
      {tooltip}
    </>
  );
}
