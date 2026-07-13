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

function collectTypes(nodes: unknown[], acc: Set<string>): Set<string> {
  for (const node of nodes as Array<Record<string, unknown>>) {
    if (typeof node.type === "string") acc.add(node.type);
    if (Array.isArray(node.children)) collectTypes(node.children, acc);
  }
  return acc;
}

describe("thickened seed fixtures", () => {
  it("includes a soft-deleted page (deletedAt set)", async () => {
    const { pages } = await buildSeedData();
    const deleted = pages.filter((p) => p.deletedAt != null);
    expect(deleted.length).toBeGreaterThanOrEqual(1);
  });

  it("has a page with 3+ revisions by 2+ distinct editors", async () => {
    const { revisions } = await buildSeedData();
    const byPage = new Map<string, Set<string>>();
    const counts = new Map<string, number>();
    for (const r of revisions) {
      counts.set(r.pageId, (counts.get(r.pageId) ?? 0) + 1);
      (
        byPage.get(r.pageId) ?? byPage.set(r.pageId, new Set()).get(r.pageId)!
      ).add(r.editedBy);
    }
    const multi = [...counts.entries()].find(
      ([id]) => (counts.get(id) ?? 0) >= 3,
    );
    expect(multi, "a page with >=3 revisions").toBeDefined();
    expect(byPage.get(multi![0])!.size).toBeGreaterThanOrEqual(2);
  });

  it("has pages authored by 2+ distinct users", async () => {
    const { pages } = await buildSeedData();
    const authors = new Set(pages.map((p) => p.createdBy));
    expect(authors.size).toBeGreaterThanOrEqual(2);
  });

  it("has a rich page containing math, table, code, callout and TOC nodes", async () => {
    const { pages } = await buildSeedData();
    const rich = pages.find((p) => {
      const types = collectTypes(JSON.parse(p.content), new Set());
      return types.has("callout") && types.has("toc");
    });
    expect(rich, "a rich-content page").toBeDefined();
    const types = collectTypes(JSON.parse(rich!.content), new Set());
    for (const t of [
      "toc",
      "equation",
      "inline_equation",
      "table",
      "code_block",
      "callout",
    ]) {
      expect(types.has(t), `node type ${t}`).toBe(true);
    }
  });

  it("seeds the wiki edit-role site setting", async () => {
    const { siteSettings } = await buildSeedData();
    expect(siteSettings.some((s) => s.key === "wiki_edit_role")).toBe(true);
  });

  it("includes canteen fixtures for e2e menu voting", async () => {
    const { canteens, menuItems } = await buildSeedData();
    expect(canteens.some((c) => c.name === "演示食堂")).toBe(true);
    const demoItems = menuItems.filter(
      (i) => i.canteenId === canteens.find((c) => c.name === "演示食堂")!.id,
    );
    expect(demoItems.length).toBeGreaterThanOrEqual(2);
    expect(demoItems.some((i) => i.svgKey === "rice")).toBe(true);
    expect(demoItems.some((i) => i.svgKey === "spicy")).toBe(true);
  });

  it("builds a hierarchy at least 3 levels deep", async () => {
    const { pages } = await buildSeedData();
    const byId = new Map(pages.map((p) => [p.id, p]));
    const depth = (p: (typeof pages)[number]): number => {
      let d = 1;
      let cur = p;
      while (cur.parentId) {
        const parent = byId.get(cur.parentId);
        if (!parent) break;
        d++;
        cur = parent;
      }
      return d;
    };
    expect(Math.max(...pages.map(depth))).toBeGreaterThanOrEqual(3);
  });
});
