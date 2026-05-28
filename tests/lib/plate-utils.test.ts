import { describe, it, expect } from "vitest";
import { parseContent } from "@/lib/plate-utils";

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
