import { describe, it, expect } from "vitest";
import {
  parseNotionFilename,
  extractLinkOrder,
} from "../../scripts/import-notion";
import { generateSlug } from "@/lib/slug";

describe("parseNotionFilename", () => {
  it("extracts title and UUID", () => {
    const result = parseNotionFilename(
      "八达通 09e7498223e7494dac05c8eaa7d25f89.md",
    );
    expect(result.title).toBe("八达通");
    expect(result.uuid).toBe("09e7498223e7494dac05c8eaa7d25f89");
  });

  it("handles English titles", () => {
    const result = parseNotionFilename(
      "Research 7d37f4cf11e34fb5bf2cabb5ebbad966.md",
    );
    expect(result.title).toBe("Research");
    expect(result.uuid).toBe("7d37f4cf11e34fb5bf2cabb5ebbad966");
  });

  it("handles titles with spaces", () => {
    const result = parseNotionFilename(
      "For 国际生 6e1ec4af86e3440b980ed3b21dc47162.md",
    );
    expect(result.title).toBe("For 国际生");
  });
});

describe("scanDir subdirectory matching", () => {
  it("parseNotionFilename title matches subdirectory name", () => {
    const filename = "入学准备（必读） d690968336b54660b20c78baf8c85646.md";
    const { title } = parseNotionFilename(filename);
    const expectedSubDir = "入学准备（必读）";
    expect(title).toBe(expectedSubDir);

    // The old buggy approach produces the wrong result
    const buggyDirName = filename.replace(/\.md$/, "");
    expect(buggyDirName).not.toBe(expectedSubDir);
  });
});

describe("extractLinkOrder", () => {
  it("extracts titles from Notion links in order", () => {
    const content = `# Root
[Teaser](Sub/Teaser%20df6289214a7a404aa554d72881e2505f.md)
[入学准备](Sub/%E5%85%A5%E5%AD%A6%E5%87%86%E5%A4%87%20d690968336b54660b20c78baf8c85646.md)
[Exchange](Sub/Exchange%2031455fc98c874f26b2c0432bb4e81405.md)`;
    const order = extractLinkOrder(content);
    expect(order).toEqual(["Teaser", "入学准备", "Exchange"]);
  });

  it("deduplicates repeated links", () => {
    const content = `[A](A%2009e7498223e7494dac05c8eaa7d25f89.md)\n[A again](A%2009e7498223e7494dac05c8eaa7d25f89.md)`;
    expect(extractLinkOrder(content)).toEqual(["A"]);
  });

  it("returns empty for content without .md links", () => {
    expect(extractLinkOrder("# No links here\nJust text.")).toEqual([]);
  });
});

describe("generateSlug (used by import)", () => {
  it("keeps Chinese characters in slug", () => {
    expect(generateSlug("八达通")).toBe("八达通");
  });

  it("handles mixed content", () => {
    expect(generateSlug("CU 全港觅食指南")).toBe("cu-全港觅食指南");
  });
});
