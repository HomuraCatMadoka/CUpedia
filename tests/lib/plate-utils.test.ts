import { describe, it, expect } from "vitest";
import { deserializeContent, serializeToMarkdown } from "@/lib/plate-utils";

describe("deserializeContent", () => {
  it("returns empty paragraph for empty string", () => {
    const result = deserializeContent("");
    expect(result).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });

  it("parses valid Plate JSON as-is", () => {
    const json = JSON.stringify([
      { type: "h2", children: [{ text: "Hello" }] },
      { type: "p", children: [{ text: "World" }] },
    ]);
    const result = deserializeContent(json);
    expect(result[0]).toMatchObject({ type: "h2" });
    expect(result[1]).toMatchObject({ type: "p" });
  });

  it("deserializes Markdown to Plate JSON", () => {
    const md = "## Hello\n\nWorld";
    const result = deserializeContent(md);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toMatchObject({ type: "h2" });
  });

  it("deserializes GFM tables", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const result = deserializeContent(md);
    const tableNode = result.find((n) => n.type === "table");
    expect(tableNode).toBeDefined();
  });

  it("deserializes code blocks", () => {
    const md = "```js\nconst x = 1;\n```";
    const result = deserializeContent(md);
    const codeBlock = result.find((n) => n.type === "code_block");
    expect(codeBlock).toBeDefined();
  });
});

describe("serializeToMarkdown", () => {
  it("serializes Plate JSON to Markdown", () => {
    const value = deserializeContent("## Hello\n\nWorld");
    const md = serializeToMarkdown(value);
    expect(md).toContain("Hello");
    expect(md).toContain("World");
  });
});
