import { describe, expect, it } from "vitest";

import { splitTitle } from "./linkify";

describe("splitTitle", () => {
  it("given a title without URLs, when split, then it is one text segment", () => {
    expect(splitTitle("Buy milk")).toEqual([{ type: "text", text: "Buy milk" }]);
  });

  it("given a URL in the middle, when split, then text around it is kept and the URL becomes a link", () => {
    expect(splitTitle("Read https://example.com/a?b=1 tonight")).toEqual([
      { type: "text", text: "Read " },
      { type: "link", text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { type: "text", text: " tonight" },
    ]);
  });

  it("given a bare www. address, when split, then it links to https", () => {
    expect(splitTitle("www.example.com")).toEqual([
      { type: "link", text: "www.example.com", href: "https://www.example.com" },
    ]);
  });

  it("given several URLs, when split, then each becomes its own link", () => {
    const links = splitTitle("a http://x.io and https://y.io").filter((s) => s.type === "link");
    expect(links.map((l) => l.text)).toEqual(["http://x.io", "https://y.io"]);
  });

  it("given sentence punctuation or wrapping parentheses after a URL, when split, then they are not part of the link", () => {
    expect(splitTitle("See https://example.com.")[1]).toMatchObject({ text: "https://example.com" });
    expect(splitTitle("(https://example.com)")).toEqual([
      { type: "text", text: "(" },
      { type: "link", text: "https://example.com", href: "https://example.com" },
      { type: "text", text: ")" },
    ]);
  });

  it("given a URL with balanced parentheses, when split, then they stay in the link", () => {
    expect(splitTitle("https://en.wikipedia.org/wiki/Foo_(bar)")[0]).toMatchObject({
      text: "https://en.wikipedia.org/wiki/Foo_(bar)",
    });
  });

  it("given a javascript: or other non-http scheme, when split, then it is left as plain text", () => {
    expect(splitTitle("javascript:alert(1)")).toEqual([
      { type: "text", text: "javascript:alert(1)" },
    ]);
    expect(splitTitle("ftp://files.example.com")).toEqual([
      { type: "text", text: "ftp://files.example.com" },
    ]);
  });

  it("given a lone 'www.', when split, then it is not treated as a link", () => {
    expect(splitTitle("visit www. later")).toEqual([{ type: "text", text: "visit www. later" }]);
  });
});
