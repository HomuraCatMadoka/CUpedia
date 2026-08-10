import { describe, it, expect } from "vitest";
import {
  buildWikiLinkRows,
  extractWikiLinkTargets,
  resolveWikiLinkUrls,
  restoreLegacyChildPageLinks,
  stripLegacyChildPageLinks,
} from "@/lib/wiki-links";
import type { PlateValue } from "@/lib/plate-utils";

const link = (pageId: string, text: string) => ({
  type: "a",
  url: "/wiki/whatever",
  pageId,
  children: [{ text }],
});

const PAGE_ONE = "11111111-1111-4111-8111-111111111111";
const PAGE_TWO = "22222222-2222-4222-8222-222222222222";

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
      {
        type: "p",
        children: [{ text: "see " }, link(PAGE_ONE, "Page One")],
      },
    ]);
    expect(extractWikiLinkTargets(content)).toEqual([PAGE_ONE]);
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

  it("ignores invalid page identities", () => {
    const content = JSON.stringify([
      { type: "p", children: [link("../../admin", "invalid")] },
    ]);

    expect(extractWikiLinkTargets(content)).toEqual([]);
  });

  it("dedupes repeated targets and finds nested links", () => {
    const content = JSON.stringify([
      {
        type: "p",
        children: [link(PAGE_ONE, "a"), link(PAGE_ONE, "b")],
      },
      {
        type: "callout",
        children: [{ type: "p", children: [link(PAGE_TWO, "c")] }],
      },
    ]);
    expect(extractWikiLinkTargets(content).sort()).toEqual([
      PAGE_ONE,
      PAGE_TWO,
    ]);
  });

  it("recognizes canonical URL-only links from Notion imports", () => {
    const content = JSON.stringify([
      {
        type: "p",
        children: [
          {
            type: "a",
            url: `/wiki/${PAGE_ONE}`,
            children: [{ text: "2026" }],
          },
        ],
      },
    ]);

    expect(extractWikiLinkTargets(content)).toEqual([PAGE_ONE]);
  });

  it("recognizes absolute Cupedia links but not lookalike external links", () => {
    const content = JSON.stringify([
      {
        type: "p",
        children: [
          {
            type: "a",
            url: `https://cupedia.org/wiki/${PAGE_ONE}`,
            children: [{ text: "2026" }],
          },
          {
            type: "a",
            url: `https://example.com/wiki/${PAGE_TWO}`,
            children: [{ text: "external" }],
          },
        ],
      },
    ]);

    expect(extractWikiLinkTargets(content)).toEqual([PAGE_ONE]);
  });
});

describe("stripLegacyChildPageLinks", () => {
  it("removes standalone child links but preserves inline mentions", () => {
    const standalone = {
      type: "p",
      children: [{ type: "a", pageId: PAGE_ONE, children: [{ text: "2026" }] }],
    };
    const inline = {
      type: "p",
      children: [
        { text: "See " },
        { type: "a", pageId: PAGE_ONE, children: [{ text: "2026" }] },
        { text: " for details." },
      ],
    };

    expect(
      stripLegacyChildPageLinks(
        [standalone, inline] as PlateValue,
        new Set([PAGE_ONE]),
      ),
    ).toEqual([inline]);
  });

  it("removes URL-only standalone child links from Notion imports", () => {
    const value = [
      {
        type: "p",
        children: [
          {
            type: "a",
            url: `/wiki/${PAGE_ONE}`,
            children: [{ text: "2026" }],
          },
        ],
      },
    ];

    expect(
      stripLegacyChildPageLinks(value as PlateValue, new Set([PAGE_ONE])),
    ).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });

  it("removes absolute Cupedia child links from Notion imports", () => {
    const value = [
      {
        type: "p",
        children: [
          {
            type: "a",
            url: `https://cupedia.org/wiki/${PAGE_ONE}`,
            children: [{ text: "2026" }],
          },
        ],
      },
    ];

    expect(
      stripLegacyChildPageLinks(value as PlateValue, new Set([PAGE_ONE])),
    ).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });
});

describe("restoreLegacyChildPageLinks", () => {
  const standalone = {
    type: "p",
    children: [
      { type: "a", pageId: PAGE_ONE, children: [{ text: "Child page" }] },
    ],
  };
  const restoredStandalone = {
    ...standalone,
    id: "wiki-projection-0",
    children: [
      {
        ...standalone.children[0],
        id: "wiki-projection-0-0",
      },
    ],
  };
  const body = { type: "p", children: [{ text: "Edited body" }] };

  it("restores a child link hidden by the editor projection", () => {
    expect(
      restoreLegacyChildPageLinks(
        [standalone, body] as PlateValue,
        [body] as PlateValue,
        new Set([PAGE_ONE]),
      ),
    ).toEqual([restoredStandalone, body]);
  });

  it("does not resurrect a link that was visible and intentionally deleted", () => {
    expect(
      restoreLegacyChildPageLinks(
        [standalone, body] as PlateValue,
        [body] as PlateValue,
        new Set(),
      ),
    ).toEqual([body]);
  });

  it("does not duplicate a hidden link already present in the submitted value", () => {
    expect(
      restoreLegacyChildPageLinks(
        [standalone, body] as PlateValue,
        [standalone, body] as PlateValue,
        new Set([PAGE_ONE]),
      ),
    ).toEqual([standalone, body]);
  });

  it("preserves existing restored identities across later saves", () => {
    const identifiedStandalone = {
      ...standalone,
      id: "stored-link",
      children: [{ ...standalone.children[0], id: "stored-inline-link" }],
    };

    expect(
      restoreLegacyChildPageLinks(
        [identifiedStandalone, body] as PlateValue,
        [body] as PlateValue,
        new Set([PAGE_ONE]),
      ),
    ).toEqual([identifiedStandalone, body]);
  });
});

describe("resolveWikiLinkUrls", () => {
  it("resolves nested wiki-link URLs to the canonical page ID", () => {
    const value = [
      {
        type: "p",
        children: [
          { text: "see " },
          {
            type: "a",
            pageId: PAGE_ONE,
            url: "/wiki/old-slug",
            children: [{ text: "Page One" }],
          },
        ],
      },
    ];

    expect(resolveWikiLinkUrls(value)).toEqual([
      {
        type: "p",
        children: [
          { text: "see " },
          {
            type: "a",
            pageId: PAGE_ONE,
            url: `/wiki/${PAGE_ONE}`,
            children: [{ text: "Page One" }],
          },
        ],
      },
    ]);
  });

  it("leaves external links and normalizes valid stored page identities", () => {
    const value = [
      {
        type: "p",
        children: [
          {
            type: "a",
            url: "https://example.com",
            children: [{ text: "external" }],
          },
          {
            type: "a",
            pageId: PAGE_ONE,
            url: "/wiki/old-slug",
            children: [{ text: "missing" }],
          },
        ],
      },
    ];

    expect(resolveWikiLinkUrls(value)).toEqual([
      {
        type: "p",
        children: [
          {
            type: "a",
            url: "https://example.com",
            children: [{ text: "external" }],
          },
          {
            type: "a",
            pageId: PAGE_ONE,
            url: `/wiki/${PAGE_ONE}`,
            children: [{ text: "missing" }],
          },
        ],
      },
    ]);
  });

  it("does not construct a route from an invalid page identity", () => {
    const value = [
      {
        type: "p",
        children: [
          {
            type: "a",
            pageId: "../../admin",
            url: "/wiki/invalid-link",
            children: [{ text: "invalid" }],
          },
        ],
      },
    ];

    expect(resolveWikiLinkUrls(value)).toBe(value);
  });
});

describe("buildWikiLinkRows", () => {
  it("includes links to existing soft-deleted pages and drops missing targets", () => {
    const content = JSON.stringify([
      {
        type: "p",
        children: [
          link(PAGE_TWO, "deleted"),
          link("33333333-3333-4333-8333-333333333333", "missing"),
        ],
      },
    ]);

    expect(
      buildWikiLinkRows([
        { id: PAGE_ONE, content, deletedAt: null },
        { id: PAGE_TWO, content: "[]", deletedAt: new Date() },
      ]),
    ).toEqual([{ sourceId: PAGE_ONE, targetId: PAGE_TWO }]);
  });
});
