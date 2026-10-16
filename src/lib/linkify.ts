// Splits a to-do item title into plain-text and URL segments, so the UI can
// render each URL as a link icon instead of the raw address.
//
// Recognised: `http://…`, `https://…`, and bare `www.…` (linked as
// https://). Nothing else — in particular never `javascript:` or other
// schemes, so a title can't smuggle a script link into the page.

export type TitleSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

// Punctuation that usually ends a sentence rather than belonging to the URL,
// e.g. "see https://example.com." or "(https://example.com)".
const TRAILING_RE = /[.,;:!?'"]+$/;

function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING_RE, "");
  // Drop unbalanced closing brackets — keeps "…/Foo_(bar)" intact but strips
  // the ")" from "(see https://x.com)".
  for (const [open, close] of [["(", ")"], ["[", "]"]] as const) {
    while (
      url.endsWith(close) &&
      url.split(close).length > url.split(open).length
    ) {
      url = url.slice(0, -1).replace(TRAILING_RE, "");
    }
  }
  return url;
}

export function splitTitle(title: string): TitleSegment[] {
  const segments: TitleSegment[] = [];
  let last = 0;

  for (const match of title.matchAll(URL_RE)) {
    const url = trimUrl(match[0]);
    // A bare "www." with nothing after it isn't a link.
    if (/^www\.?$/i.test(url)) continue;
    const start = match.index;
    if (start > last) segments.push({ type: "text", text: title.slice(last, start) });
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    segments.push({ type: "link", text: url, href });
    last = start + url.length;
  }

  if (last < title.length) segments.push({ type: "text", text: title.slice(last) });
  return segments;
}
