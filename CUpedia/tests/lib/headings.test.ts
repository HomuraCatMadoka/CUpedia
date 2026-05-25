import { describe, it, expect } from "vitest";
import { extractHeadings, headingSlug } from "@/lib/headings";
import { renderMarkdown } from "@/lib/markdown";

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

describe("extractHeadings", () => {
  it("extracts h2 and h3 headings with correct level", () => {
    const md = `# Title\n\n## Section One\n\nContent\n\n### Sub Section\n\nMore content\n\n## Section Two\n`;
    const result = extractHeadings(md);
    expect(result).toEqual([
      { id: "section-one", text: "Section One", level: 2 },
      { id: "sub-section", text: "Sub Section", level: 3 },
      { id: "section-two", text: "Section Two", level: 2 },
    ]);
  });

  it("ignores h1 and h4+ headings", () => {
    const md = `# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n`;
    const result = extractHeadings(md);
    expect(result).toEqual([
      { id: "h2", text: "H2", level: 2 },
      { id: "h3", text: "H3", level: 3 },
    ]);
  });

  it("generates unique IDs for duplicate headings", () => {
    const md = `## Section\n\n## Section\n\n## Section\n`;
    const result = extractHeadings(md);
    expect(result).toEqual([
      { id: "section", text: "Section", level: 2 },
      { id: "section-1", text: "Section", level: 2 },
      { id: "section-2", text: "Section", level: 2 },
    ]);
  });

  it("returns empty array for content with no h2/h3", () => {
    expect(extractHeadings("# Only H1\n\nParagraph text")).toEqual([]);
    expect(extractHeadings("")).toEqual([]);
  });

  it("extracts CJK headings with correct slugs", () => {
    const md = `## 入学前\n\n### 过关攻略\n`;
    const result = extractHeadings(md);
    expect(result).toEqual([
      { id: "入学前", text: "入学前", level: 2 },
      { id: "过关攻略", text: "过关攻略", level: 3 },
    ]);
  });
});

describe("renderMarkdown heading IDs", () => {
  it("injects id attributes on h2 and h3 matching extractHeadings output", async () => {
    const md = `## Section One\n\n### Sub Section\n\n## 入学前\n`;
    const html = await renderMarkdown(md);
    const headings = extractHeadings(md);

    for (const h of headings) {
      expect(html).toContain(`id="${h.id}"`);
    }
  });

  it("does not inject id on h1 or h4", async () => {
    const md = `# H1 Title\n\n#### H4 Title\n`;
    const html = await renderMarkdown(md);
    expect(html).not.toMatch(/id="/);
  });
});
