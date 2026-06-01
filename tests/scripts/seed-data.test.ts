import { describe, it, expect } from "vitest";
import { buildSeedData } from "../../scripts/seed-data";
import { toMarkdown } from "@/lib/plate-utils";

describe("seed data content format", () => {
  it("stores every page's content as valid Plate JSON", async () => {
    const { pages } = await buildSeedData();
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const nodes = JSON.parse(page.content);
      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes[0]).toHaveProperty("type");
    }
  });

  it("stores every revision's content as valid Plate JSON", async () => {
    const { revisions } = await buildSeedData();
    expect(revisions.length).toBeGreaterThan(0);
    for (const rev of revisions) {
      const nodes = JSON.parse(rev.content);
      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes[0]).toHaveProperty("type");
    }
  });

  // Regression: history/diff renders revisions via toMarkdown(), which does a
  // bare JSON.parse and throws on raw markdown. Seed content must survive it.
  it("survives toMarkdown() without throwing (history/diff path)", async () => {
    const { pages, revisions } = await buildSeedData();
    for (const { content } of [...pages, ...revisions]) {
      await expect(toMarkdown(content)).resolves.toBeTypeOf("string");
    }
  });
});
