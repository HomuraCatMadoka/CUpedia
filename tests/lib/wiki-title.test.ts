import { describe, expect, it } from "vitest";
import { getWikiDisplayTitle } from "@/lib/wiki-title";

describe("getWikiDisplayTitle", () => {
  it("labels empty and whitespace-only titles as untitled", () => {
    expect(getWikiDisplayTitle("")).toBe("未命名");
    expect(getWikiDisplayTitle("   ")).toBe("未命名");
  });

  it("preserves authored titles", () => {
    expect(getWikiDisplayTitle("课程指南")).toBe("课程指南");
  });
});
