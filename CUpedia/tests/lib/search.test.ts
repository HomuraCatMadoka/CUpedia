import { describe, it, expect } from "vitest";
import { searchPages } from "@/lib/search";

const pages = [
  {
    id: "1",
    slug: "衣",
    title: "衣",
    content: "需要穿正装的场合：部分书院高桌晚宴、领奖、部分大英课",
  },
  {
    id: "2",
    slug: "bbajd",
    title: "BBAJD",
    content: "会议着装是正装，背景不要太乱，会议面试官去年是两位",
  },
  {
    id: "3",
    slug: "善衡",
    title: "善衡",
    content: "正装出席高桌晚宴",
  },
  {
    id: "4",
    slug: "觅食指南",
    title: "觅食指南",
    content: "推荐各种美食和餐厅",
  },
  {
    id: "5",
    slug: "正装指南",
    title: "正装指南",
    content: "本文介绍如何选择合适的正装",
  },
  {
    id: "6",
    slug: "other",
    title: "Other Page",
    content: "This page has nothing relevant",
  },
];

describe("searchPages", () => {
  describe("minimum query length", () => {
    it("returns empty for empty string", () => {
      expect(searchPages(pages, "")).toEqual([]);
    });

    it("returns empty for whitespace only", () => {
      expect(searchPages(pages, "   ")).toEqual([]);
    });

    it("returns empty for single character", () => {
      expect(searchPages(pages, "衣")).toEqual([]);
    });
  });

  describe("exact substring matching", () => {
    it("finds all pages containing the keyword in content", () => {
      const results = searchPages(pages, "正装");
      const ids = results.map((r) => r.id);
      expect(ids).toContain("1");
      expect(ids).toContain("2");
      expect(ids).toContain("3");
      expect(ids).toContain("5");
      expect(ids).not.toContain("4");
      expect(ids).not.toContain("6");
    });

    it("matches case-insensitively for latin characters", () => {
      const results = searchPages(pages, "bbajd");
      expect(results.map((r) => r.id)).toContain("2");
    });

    it("matches keywords in title", () => {
      const results = searchPages(pages, "觅食");
      expect(results.map((r) => r.id)).toContain("4");
    });
  });

  describe("ranking", () => {
    it("ranks title matches above content-only matches", () => {
      const results = searchPages(pages, "正装");
      const titleMatchIdx = results.findIndex((r) => r.id === "5");
      const contentOnlyIdx = results.findIndex((r) => r.id === "1");
      expect(titleMatchIdx).toBeLessThan(contentOnlyIdx);
    });

    it("within content matches, ranks by earlier occurrence position", () => {
      const results = searchPages(pages, "正装");
      const contentResults = results.filter((r) => r.id !== "5");
      const idxShanHeng = contentResults.findIndex((r) => r.id === "3"); // pos 0
      const idxYi = contentResults.findIndex((r) => r.id === "1"); // pos 4
      expect(idxShanHeng).toBeLessThan(idxYi);
    });
  });

  describe("snippet generation", () => {
    it("generates snippet for content matches with <mark> wrapped keyword", () => {
      const results = searchPages(pages, "正装");
      const yi = results.find((r) => r.id === "1");
      expect(yi?.snippet).toContain("<mark>正装</mark>");
    });

    it("does not generate snippet when match is title-only", () => {
      const pagesWithTitleOnly = [
        { id: "t1", slug: "test", title: "正装选购", content: "无关内容" },
      ];
      const results = searchPages(pagesWithTitleOnly, "正装");
      expect(results[0].snippet).toBeUndefined();
    });

    it("handles keyword at the very beginning of content", () => {
      const results = searchPages(pages, "正装");
      const shanHeng = results.find((r) => r.id === "3");
      expect(shanHeng?.snippet).toContain("<mark>正装</mark>");
    });

    it("handles keyword at the very end of content", () => {
      const pagesEndMatch = [
        { id: "e1", slug: "end", title: "Test", content: "一些前面的内容正装" },
      ];
      const results = searchPages(pagesEndMatch, "正装");
      expect(results[0].snippet).toContain("<mark>正装</mark>");
    });
  });

  describe("result limit", () => {
    it("returns at most 20 results", () => {
      const manyPages = Array.from({ length: 30 }, (_, i) => ({
        id: `p${i}`,
        slug: `page-${i}`,
        title: `Page ${i}`,
        content: `这个页面包含正装的相关内容 ${i}`,
      }));
      const results = searchPages(manyPages, "正装");
      expect(results.length).toBeLessThanOrEqual(20);
    });
  });

  describe("special characters", () => {
    it("handles % in query without error", () => {
      expect(() => searchPages(pages, "100%")).not.toThrow();
    });

    it("handles _ in query without error", () => {
      expect(() => searchPages(pages, "a_b")).not.toThrow();
    });

    it("handles \\ in query without error", () => {
      expect(() => searchPages(pages, "a\\b")).not.toThrow();
    });
  });

  describe("fuzzy fallback", () => {
    it("falls back to fuzzy when exact match returns 0 results", () => {
      // "BBXJD" is not a substring of anything, but fuzzy-close to "BBAJD"
      const results = searchPages(pages, "BBXJD");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("2");
    });

    it("does not use fuzzy when exact match has results", () => {
      const results = searchPages(pages, "正装");
      results.forEach((r) => {
        const page = pages.find((p) => p.id === r.id)!;
        const inTitle = page.title.toLowerCase().includes("正装");
        const inContent = page.content.toLowerCase().includes("正装");
        expect(inTitle || inContent).toBe(true);
      });
    });
  });
});
