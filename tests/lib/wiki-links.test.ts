import { describe, it, expect } from "vitest";
import { extractWikiLinkTargets } from "@/lib/wiki-links";

const link = (pageId: string, text: string) => ({
  type: "a",
  url: "/wiki/whatever",
  pageId,
  children: [{ text }],
});

describe("extractWikiLinkTargets", () => {
  it("returns empty array for empty content", () => {
    expect(extractWikiLinkTargets("")).toEqual([]);
    expect(extractWikiLinkTargets("   ")).toEqual([]);
  });

  it("returns empty array for non-JSON content", () => {
    expect(extractWikiLinkTargets("# legacy markdown [[x]]")).toEqual([]);
  });

  it("collects pageId from wiki-link nodes", () => {
    const content = JSON.stringify([
      { type: "p", children: [{ text: "see " }, link("p1", "Page One")] },
    ]);
    expect(extractWikiLinkTargets(content)).toEqual(["p1"]);
  });

  it("ignores plain external links without a pageId", () => {
    const content = JSON.stringify([
      {
        type: "p",
        children: [
          { type: "a", url: "https://x.com", children: [{ text: "x" }] },
        ],
      },
    ]);
    expect(extractWikiLinkTargets(content)).toEqual([]);
  });

  it("dedupes repeated targets and finds nested links", () => {
    const content = JSON.stringify([
      { type: "p", children: [link("p1", "a"), link("p1", "b")] },
      {
        type: "callout",
        children: [{ type: "p", children: [link("p2", "c")] }],
      },
    ]);
    expect(extractWikiLinkTargets(content).sort()).toEqual(["p1", "p2"]);
  });
});
