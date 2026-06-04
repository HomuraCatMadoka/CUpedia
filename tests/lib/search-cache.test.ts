import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRevalidateTag,
  mockUnstableCache,
  unstableCacheCalls,
  cacheStore,
  mockDbSelect,
  mockDbExecute,
  mockDbUpdate,
  mockDbTransaction,
  mockDbQueryWikiPages,
  mockDbQueryWikiRevisions,
} = vi.hoisted(() => {
  const unstableCacheCalls: unknown[][] = [];
  const cacheStore = new Map<string, unknown>();
  return {
    mockRevalidateTag: vi.fn((..._a: unknown[]) => cacheStore.clear()),
    mockUnstableCache: vi.fn((...args: unknown[]) => {
      unstableCacheCalls.push(args);
      const loader = args[0] as () => Promise<unknown>;
      const key = JSON.stringify(args[1]);
      return async () => {
        if (!cacheStore.has(key)) cacheStore.set(key, await loader());
        return cacheStore.get(key);
      };
    }),
    unstableCacheCalls,
    cacheStore,
    mockDbSelect: vi.fn(),
    mockDbExecute: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockDbQueryWikiPages: { findFirst: vi.fn() },
    mockDbQueryWikiRevisions: { findFirst: vi.fn(), findMany: vi.fn() },
  };
});

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    execute: (...args: unknown[]) => mockDbExecute(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    transaction: (fn: (...a: unknown[]) => unknown) => mockDbTransaction(fn),
    query: {
      wikiPages: mockDbQueryWikiPages,
      wikiRevisions: mockDbQueryWikiRevisions,
    },
  },
}));

vi.mock("@/db/schema", () => ({
  wikiPages: {
    id: "id",
    slug: "slug",
    title: "title",
    content: "content",
    deletedAt: "deletedAt",
    parentId: "parentId",
    sortOrder: "sortOrder",
    updatedAt: "updatedAt",
  },
  wikiRevisions: {
    id: "id",
    pageId: "pageId",
    createdAt: "createdAt",
  },
  wikiLinks: {
    sourceId: "sourceId",
    targetId: "targetId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  isNull: vi.fn(),
  and: vi.fn(),
  sql: (...args: unknown[]) => args,
  desc: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (...args: unknown[]) => mockUnstableCache(...args),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireEditor: vi.fn().mockResolvedValue({ id: "user-1" }),
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
}));

vi.mock("@/lib/slug", () => ({
  validateSlug: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/plate-utils", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/plate-utils")>(
      "@/lib/plate-utils",
    );
  return { ...actual, extractText: vi.fn(actual.extractText) };
});

import { extractText } from "@/lib/plate-utils";
const mockExtractText = vi.mocked(extractText);

import {
  searchWikiPages,
  getWikiTree,
  getWikiPage,
  getBacklinks,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  restoreWikiPage,
  rollbackToRevision,
} from "@/lib/wiki-actions";

const mockPages = [
  {
    id: "1",
    slug: "衣",
    title: "衣",
    content: JSON.stringify([
      { type: "p", children: [{ text: "需要穿正装的场合" }] },
    ]),
  },
  {
    id: "2",
    slug: "食",
    title: "觅食指南",
    content: JSON.stringify([{ type: "p", children: [{ text: "推荐美食" }] }]),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  cacheStore.clear();
});

describe("searchWikiPages (cached)", () => {
  beforeEach(() => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockPages),
      }),
    });
  });

  it("returns results using new search engine with snippet", async () => {
    const results = await searchWikiPages("正装");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("1");
    expect(results[0].snippet).toContain("<mark>正装</mark>");
  });

  it("returns empty for short queries", async () => {
    const results = await searchWikiPages("衣");
    expect(results).toEqual([]);
  });

  it("returns empty for empty string", async () => {
    const results = await searchWikiPages("");
    expect(results).toEqual([]);
  });

  it("falls back to fuzzy match when no exact match", async () => {
    const results = await searchWikiPages("觅食");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("2");
  });

  it("extracts text inside the cached loader, not per search call", async () => {
    mockExtractText.mockClear();
    await searchWikiPages("正装");
    await searchWikiPages("美食");
    // extractText runs once per page within the cached data loader,
    // and is not re-run by searchWikiPages on each request.
    expect(mockExtractText).toHaveBeenCalledTimes(mockPages.length);
  });

  it("cached search loader is tagged wiki-pages for invalidation", () => {
    const call = unstableCacheCalls.find(
      (c) =>
        Array.isArray(c[1]) && (c[1] as string[]).includes("wiki-pages-search"),
    );
    expect(call).toBeDefined();
    expect((call![2] as { tags: string[] }).tags).toContain("wiki-pages");
  });
});

describe("cache invalidation — revalidateTag called", () => {
  it("createWikiPage calls revalidateTag", async () => {
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([{ id: "new-1", slug: "t", title: "T" }]),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        };
        return fn(tx);
      },
    );

    await createWikiPage({ slug: "test", title: "Test", content: "content" });
    expect(mockRevalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
  });

  it("updateWikiPage calls revalidateTag", async () => {
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
      updatedAt: new Date("2024-01-01"),
    });
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: "1" }]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        };
        return fn(tx);
      },
    );

    await updateWikiPage({
      slug: "test",
      title: "Updated",
      content: "new",
      expectedUpdatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
  });

  it("deleteWikiPage calls revalidateTag", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ id: "1" }] });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await deleteWikiPage("1");
    expect(mockRevalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
  });

  it("restoreWikiPage calls revalidateTag", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ id: "1" }] });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await restoreWikiPage("1");
    expect(mockRevalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
  });

  it("rollbackToRevision calls revalidateTag", async () => {
    mockDbQueryWikiRevisions.findFirst.mockResolvedValue({
      id: "rev-1",
      title: "Old",
      content: "Old content",
    });
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
    });
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
        };
        return fn(tx);
      },
    );

    await rollbackToRevision("1", "rev-1");
    expect(mockRevalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
  });
});

describe("read caching — getWikiTree & getWikiPage", () => {
  const treeData = [
    { id: "1", slug: "guide", title: "Guide", parentId: null, sortOrder: 0 },
    { id: "2", slug: "faq", title: "FAQ", parentId: null, sortOrder: 1 },
  ];
  const pageData = {
    id: "1",
    slug: "guide",
    title: "Guide",
    content: "# Guide",
    createdByUser: { nickname: "test" },
    updatedByUser: { nickname: "test" },
  };

  it("getWikiTree is wrapped with unstable_cache tagged wiki-pages", () => {
    const call = unstableCacheCalls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes("wiki-tree"),
    );
    expect(call).toBeDefined();
    expect((call![2] as { tags: string[] }).tags).toContain("wiki-pages");
  });

  it("getWikiPage is wrapped with unstable_cache tagged wiki-pages", () => {
    const call = unstableCacheCalls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes("wiki-page"),
    );
    expect(call).toBeDefined();
    expect((call![2] as { tags: string[] }).tags).toContain("wiki-pages");
  });

  it("getWikiTree returns tree data", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(treeData),
        }),
      }),
    });
    const result = await getWikiTree();
    expect(result).toEqual(treeData);
  });

  it("getWikiPage returns page by slug", async () => {
    mockDbQueryWikiPages.findFirst.mockResolvedValue(pageData);
    const result = await getWikiPage("guide");
    expect(result).toEqual(pageData);
  });

  it("getWikiPage returns null for missing page", async () => {
    mockDbQueryWikiPages.findFirst.mockResolvedValue(undefined);
    const result = await getWikiPage("nonexistent");
    expect(result).toBeNull();
  });

  it("getBacklinks is wrapped with unstable_cache tagged wiki-pages", () => {
    const call = unstableCacheCalls.find(
      (c) =>
        Array.isArray(c[1]) && (c[1] as string[]).includes("wiki-backlinks"),
    );
    expect(call).toBeDefined();
    expect((call![2] as { tags: string[] }).tags).toContain("wiki-pages");
  });

  it("getBacklinks returns linking source pages", async () => {
    const rows = [{ slug: "a", title: "Page A" }];
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    });
    const result = await getBacklinks("target-1");
    expect(result).toEqual(rows);
  });

  it("getBacklinks degrades to empty list when the query fails", async () => {
    cacheStore.clear();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi
              .fn()
              .mockRejectedValue(
                new Error('relation "wiki_links" does not exist'),
              ),
          }),
        }),
      }),
    });

    const result = await getBacklinks("target-2");
    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
