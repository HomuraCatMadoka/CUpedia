import { describe, it, expect } from "vitest";
import {
  extractHeadings,
  extractHeadingsFromNodes,
  headingSlug,
  stripTitleHeading,
} from "@/lib/headings";
import type { PlateValue } from "@/lib/plate-utils";

describe("headingSlug", () => {
  it("handles CJK text", () => {
    expect(headingSlug("入学前准备")).toBe("入学前准备");
  });

  it("handles mixed CJK and English", () => {
    expect(headingSlug("校园WiFi指南")).toBe("校园wifi指南");
  });

  it("handles special characters and whitespace", () => {
    expect(headingSlug("Q&A: 常见问题！")).toBe("q-a-常见问题");
  });
});

describe("extractHeadingsFromNodes", () => {
  it("extracts h2 and h3 headings with correct level", () => {
    const nodes = [
      { type: "h1", children: [{ text: "Title" }] },
      { type: "h2", children: [{ text: "Section One" }] },
      { type: "p", children: [{ text: "Content" }] },
      { type: "h3", children: [{ text: "Sub Section" }] },
      { type: "h2", children: [{ text: "Section Two" }] },
    ];
    expect(extractHeadingsFromNodes(nodes)).toEqual([
      { id: "section-one", text: "Section One", level: 2 },
      { id: "sub-section", text: "Sub Section", level: 3 },
      { id: "section-two", text: "Section Two", level: 2 },
    ]);
  });

  it("ignores h1 and h4+ headings", () => {
    const nodes = [
      { type: "h1", children: [{ text: "H1" }] },
      { type: "h2", children: [{ text: "H2" }] },
      { type: "h3", children: [{ text: "H3" }] },
      { type: "h4", children: [{ text: "H4" }] },
    ];
    expect(extractHeadingsFromNodes(nodes)).toEqual([
      { id: "h2", text: "H2", level: 2 },
      { id: "h3", text: "H3", level: 3 },
    ]);
  });

  it("generates unique IDs for duplicate headings", () => {
    const nodes = [
      { type: "h2", children: [{ text: "Section" }] },
      { type: "h2", children: [{ text: "Section" }] },
      { type: "h2", children: [{ text: "Section" }] },
    ];
    expect(extractHeadingsFromNodes(nodes)).toEqual([
      { id: "section", text: "Section", level: 2 },
      { id: "section-1", text: "Section", level: 2 },
      { id: "section-2", text: "Section", level: 2 },
    ]);
  });

  it("returns empty array for content with no h2/h3", () => {
    const nodes = [
      { type: "h1", children: [{ text: "Only H1" }] },
      { type: "p", children: [{ text: "Paragraph" }] },
    ];
    expect(extractHeadingsFromNodes(nodes)).toEqual([]);
  });

  it("extracts CJK headings with correct slugs", () => {
    const nodes = [
      { type: "h2", children: [{ text: "入学前" }] },
      { type: "h3", children: [{ text: "过关攻略" }] },
    ];
    expect(extractHeadingsFromNodes(nodes)).toEqual([
      { id: "入学前", text: "入学前", level: 2 },
      { id: "过关攻略", text: "过关攻略", level: 3 },
    ]);
  });

  it("handles headings with inline formatting", () => {
    const nodes = [
      {
        type: "h2",
        children: [
          { text: "Bold " },
          { text: "heading", bold: true },
          { text: " text" },
        ],
      },
    ];
    expect(extractHeadingsFromNodes(nodes)).toEqual([
      { id: "bold-heading-text", text: "Bold heading text", level: 2 },
    ]);
  });

  it("skips empty headings", () => {
    const nodes = [
      { type: "h2", children: [{ text: "" }] },
      { type: "h2", children: [{ text: "Real heading" }] },
    ];
    expect(extractHeadingsFromNodes(nodes)).toEqual([
      { id: "real-heading", text: "Real heading", level: 2 },
    ]);
  });
});

describe("extractHeadings with Plate JSON string", () => {
  it("parses JSON content and extracts headings", () => {
    const json = JSON.stringify([
      { type: "h2", children: [{ text: "Section" }] },
      { type: "p", children: [{ text: "Content" }] },
    ]);
    expect(extractHeadings(json)).toEqual([
      { id: "section", text: "Section", level: 2 },
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(extractHeadings("")).toEqual([]);
  });

  it("returns no headings for non-JSON (legacy) content", () => {
    expect(extractHeadings("not json at all")).toEqual([]);
  });
});

describe("stripTitleHeading", () => {
  const body = [
    { type: "h2", children: [{ text: "Section" }] },
    { type: "p", children: [{ text: "Content" }] },
  ];

  it("drops a leading h1 matching the page title", () => {
    const value = [
      { type: "h1", children: [{ text: "My Page" }] },
      ...body,
    ] as PlateValue;
    expect(stripTitleHeading(value, "My Page")).toEqual(body);
  });

  it("drops the first h1 even when a toc node precedes it", () => {
    const value = [
      { type: "toc", children: [{ text: "" }] },
      { type: "h1", children: [{ text: "My Page" }] },
      ...body,
    ] as PlateValue;
    expect(stripTitleHeading(value, "My Page")).toEqual([
      { type: "toc", children: [{ text: "" }] },
      ...body,
    ]);
  });

  it("compares titles after trimming whitespace", () => {
    const value = [
      { type: "h1", children: [{ text: "  My Page " }] },
      ...body,
    ] as PlateValue;
    expect(stripTitleHeading(value, "My Page")).toEqual(body);
  });

  it("flattens inline formatting in the title h1", () => {
    const value = [
      {
        type: "h1",
        children: [{ text: "My " }, { text: "Page", bold: true }],
      },
      ...body,
    ] as PlateValue;
    expect(stripTitleHeading(value, "My Page")).toEqual(body);
  });

  it("keeps the first h1 when its text differs from the title", () => {
    const value = [
      { type: "h1", children: [{ text: "Other Title" }] },
      ...body,
    ] as PlateValue;
    expect(stripTitleHeading(value, "My Page")).toBe(value);
  });

  it("only inspects the first h1, ignoring a later same-named one", () => {
    const value = [
      { type: "h1", children: [{ text: "Other Title" }] },
      { type: "h1", children: [{ text: "My Page" }] },
    ] as PlateValue;
    expect(stripTitleHeading(value, "My Page")).toBe(value);
  });

  it("keeps the content when there is no h1", () => {
    const value = [...body] as PlateValue;
    expect(stripTitleHeading(value, "Section")).toBe(value);
  });

  it("handles an empty value", () => {
    const value = [] as PlateValue;
    expect(stripTitleHeading(value, "My Page")).toBe(value);
  });
});
