"use client";

import { useTooltip } from "./Tooltip";
import { LinkIcon } from "./icons";

// A URL from an item title, rendered as a small link icon that opens the
// URL in a new tab. The full URL is shown in a tooltip on mouse hover /
// keyboard focus; on touch devices it's just the icon.
export default function UrlIcon({ href, text }: { href: string; text: string }) {
  const { handlers, tooltip } = useTooltip(text, { wrap: true });

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open link: ${text}`}
        {...handlers}
        className="mx-0.5 inline-flex translate-y-[2px] items-center justify-center rounded p-0.5 align-baseline text-blue-600 transition duration-150 ease-out hover:scale-110 hover:bg-blue-100 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
      >
        <LinkIcon />
      </a>
      {tooltip}
    </>
  );
}
