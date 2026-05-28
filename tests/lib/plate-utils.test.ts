import { describe, it, expect } from "vitest";
import { parseContent, extractText, toMarkdown } from "@/lib/plate-utils";

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

  it("throws on invalid JSON", () => {
    expect(() => parseContent("not json")).toThrow();
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
});
