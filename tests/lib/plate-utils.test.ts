import { describe, it, expect } from "vitest";
import {
  parseContent,
  extractText,
  toMarkdown,
  fromMarkdown,
} from "@/lib/plate-utils";

describe("parseContent", () => {
  it("returns empty paragraph for empty string", () => {
    const result = parseContent("");
    expect(result).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });

  it("returns empty paragraph for whitespace-only string", () => {
    const result = parseContent("   \n  ");
    expect(result).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });

  it("parses valid Plate JSON string", () => {
    const json = JSON.stringify([
      { type: "h2", children: [{ text: "Hello" }] },
      { type: "p", children: [{ text: "World" }] },
    ]);
    const result = parseContent(json);
    expect(result[0]).toMatchObject({ type: "h2" });
    expect(result[1]).toMatchObject({ type: "p" });
  });

  it("degrades non-JSON content to a plain-text paragraph", () => {
    const result = parseContent("# Welcome\n\nlegacy markdown");
    expect(result).toEqual([
      { type: "p", children: [{ text: "# Welcome\n\nlegacy markdown" }] },
    ]);
  });
});

describe("extractText", () => {
  it("extracts text from paragraphs", () => {
    const json = JSON.stringify([
      { type: "p", children: [{ text: "Hello world" }] },
    ]);
    expect(extractText(json)).toBe("Hello world");
  });

  it("joins multiple blocks with newlines", () => {
    const json = JSON.stringify([
      { type: "h2", children: [{ text: "Title" }] },
      { type: "p", children: [{ text: "Body text" }] },
    ]);
    expect(extractText(json)).toBe("Title\nBody text");
  });

  it("extracts text from inline formatting", () => {
    const json = JSON.stringify([
      {
        type: "p",
        children: [
          { text: "normal " },
          { text: "bold", bold: true },
          { text: " end" },
        ],
      },
    ]);
    expect(extractText(json)).toBe("normal bold end");
  });

  it("returns empty string for empty content", () => {
    expect(extractText("")).toBe("");
    expect(extractText("  ")).toBe("");
  });

  it("extracts text from callout blocks", () => {
    const json = JSON.stringify([
      {
        type: "callout",
        variant: "warning",
        children: [{ text: "This is a warning" }],
      },
    ]);
    expect(extractText(json)).toBe("This is a warning");
  });
});

describe("toMarkdown", () => {
  it("serializes heading and paragraph to markdown", async () => {
    const json = JSON.stringify([
      { type: "h2", children: [{ text: "Title" }] },
      { type: "p", children: [{ text: "Body" }] },
    ]);
    const md = await toMarkdown(json);
    expect(md).toContain("## Title");
    expect(md).toContain("Body");
  });

  it("serializes block equation to $$ markdown", async () => {
    const json = JSON.stringify([
      {
        type: "equation",
        texExpression: "E = mc^2",
        children: [{ text: "" }],
      },
    ]);
    const md = await toMarkdown(json);
    expect(md).toContain("$$");
    expect(md).toContain("E = mc^2");
  });

  it("preserves callout text in markdown output", async () => {
    const json = JSON.stringify([
      {
        type: "callout",
        variant: "warning",
        icon: "⚠️",
        children: [{ text: "Warning content here" }],
      },
    ]);
    const md = await toMarkdown(json);
    expect(md).toContain("Warning content here");
  });
});

describe("fromMarkdown", () => {
  it("converts heading and paragraph to Plate JSON string", async () => {
    const json = await fromMarkdown("## Title\n\nBody text");
    const nodes = JSON.parse(json);
    expect(nodes[0]).toMatchObject({ type: "h2" });
    expect(nodes.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty paragraph JSON for empty string", async () => {
    const json = await fromMarkdown("");
    const nodes = JSON.parse(json);
    expect(nodes).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });

  it("round-trips: fromMarkdown → toMarkdown preserves content", async () => {
    const original = "## Hello\n\nWorld";
    const json = await fromMarkdown(original);
    const md = await toMarkdown(json);
    expect(md).toContain("## Hello");
    expect(md).toContain("World");
  });

  it("deserializes $$ block equation from markdown", async () => {
    const json = await fromMarkdown("$$\nE = mc^2\n$$");
    const nodes = JSON.parse(json);
    expect(nodes.some((n: { type: string }) => n.type === "equation")).toBe(
      true,
    );
    const eq = nodes.find((n: { type: string }) => n.type === "equation");
    expect(eq.texExpression).toBe("E = mc^2");
  });

  it("converts GFM tables", async () => {
    const json = await fromMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    const nodes = JSON.parse(json);
    expect(nodes.some((n: { type: string }) => n.type === "table")).toBe(true);
  });
});
