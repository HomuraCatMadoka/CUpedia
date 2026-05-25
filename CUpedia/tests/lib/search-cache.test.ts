import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRevalidateTag,
  mockDbSelect,
  mockDbExecute,
  mockDbUpdate,
  mockDbTransaction,
  mockDbQueryWikiPages,
  mockDbQueryWikiRevisions,
} = vi.hoisted(() => ({
  mockRevalidateTag: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbExecute: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockDbQueryWikiPages: { findFirst: vi.fn() },
  mockDbQueryWikiRevisions: { findFirst: vi.fn(), findMany: vi.fn() },
}));

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
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireEditor: vi.fn().mockResolvedValue({ id: "user-1" }),
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
}));

vi.mock("@/lib/slug", () => ({
  validateSlug: vi.fn().mockReturnValue(true),
}));

import {
  searchWikiPages,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  restoreWikiPage,
  rollbackToRevision,
} from "@/lib/wiki-actions";

const mockPages = [
  { id: "1", slug: "衣", title: "衣", content: "需要穿正装的场合" },
  { id: "2", slug: "食", title: "觅食指南", content: "推荐美食" },
];

beforeEach(() => {
  vi.clearAllMocks();
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
