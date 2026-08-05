import { afterEach, describe, it, expect, vi } from "vitest";
import {
  parseNotionFilename,
  extractLinkOrder,
  notionIdToUuid,
  revalidateWikiCache,
  rewriteDroppedRootLinks,
} from "../../scripts/import-notion";

afterEach(() => {
  delete process.env.WIKI_REVALIDATE_URL;
  delete process.env.WIKI_REVALIDATE_SECRET;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

describe("notionIdToUuid", () => {
  it("preserves the exported Notion identity in UUID form", () => {
    expect(notionIdToUuid("09e7498223e7494dac05c8eaa7d25f89")).toBe(
      "09e74982-23e7-494d-ac05-c8eaa7d25f89",
    );
  });

  it("generates a UUID when the export has no valid Notion identity", () => {
    expect(notionIdToUuid("invalid-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("rewriteDroppedRootLinks", () => {
  it("points links to an unwrapped root at the wiki index", () => {
    const rootId = "09e74982-23e7-494d-ac05-c8eaa7d25f89";
    expect(
      rewriteDroppedRootLinks(
        `[Root](/wiki/${rootId})\n[Section](/wiki/${rootId}#section)`,
        rootId,
      ),
    ).toBe("[Root](/wiki)\n[Section](/wiki#section)");
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

describe("revalidateWikiCache", () => {
  it("skips with a warning when revalidation is not configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(revalidateWikiCache()).resolves.toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("rejects partial configuration", async () => {
    process.env.WIKI_REVALIDATE_URL =
      "https://cupedia.org/api/internal/revalidate-wiki";

    await expect(revalidateWikiCache()).rejects.toThrow(
      "WIKI_REVALIDATE_URL and WIKI_REVALIDATE_SECRET must be set together",
    );
  });

  it("posts the bearer secret to the configured endpoint", async () => {
    process.env.WIKI_REVALIDATE_URL =
      "https://cupedia.org/api/internal/revalidate-wiki";
    process.env.WIKI_REVALIDATE_SECRET = "test-secret";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(revalidateWikiCache()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(process.env.WIKI_REVALIDATE_URL, {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    });
  });

  it("reports a non-success response", async () => {
    process.env.WIKI_REVALIDATE_URL =
      "https://cupedia.org/api/internal/revalidate-wiki";
    process.env.WIKI_REVALIDATE_SECRET = "test-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    await expect(revalidateWikiCache()).rejects.toThrow("HTTP 401");
  });
});
