import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRevalidateTag,
  mockRevalidatePath,
  mockUpdateTag,
  mockUnstableCache,
  unstableCacheCalls,
  cacheStore,
  mockDbSelect,
  mockDbExecute,
  mockDbUpdate,
  mockDbTransaction,
  mockDbQueryWikiPages,
  mockDbQueryWikiRevisions,
  mockAssertContributorComplete,
  mockEq,
  mockIsNull,
  mockIsNotNull,
  mockGte,
  mockLt,
} = vi.hoisted(() => {
  const unstableCacheCalls: unknown[][] = [];
  const cacheStore = new Map<string, unknown>();
  return {
    mockRevalidateTag: vi.fn((...args: unknown[]) => {
      void args; // signature must accept the tag args; body only resets the store
      cacheStore.clear();
    }),
    mockRevalidatePath: vi.fn(),
    mockUpdateTag: vi.fn((...args: unknown[]) => {
      void args;
      cacheStore.clear();
    }),
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
    mockAssertContributorComplete: vi.fn(async (user) => user),
    mockEq: vi.fn(),
    mockIsNull: vi.fn(),
    mockIsNotNull: vi.fn(),
    mockGte: vi.fn(),
    mockLt: vi.fn(),
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
    version: "version",
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
  eq: (...args: unknown[]) => mockEq(...args),
  isNull: (...args: unknown[]) => mockIsNull(...args),
  isNotNull: (...args: unknown[]) => mockIsNotNull(...args),
  and: vi.fn(),
  sql: (...args: unknown[]) => args,
  desc: vi.fn(),
  inArray: vi.fn(),
  gte: (...args: unknown[]) => mockGte(...args),
  lt: (...args: unknown[]) => mockLt(...args),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (...args: unknown[]) => mockUnstableCache(...args),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
  updateTag: (...args: unknown[]) => mockUpdateTag(...args),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireEditor: vi.fn().mockResolvedValue({ id: "user-1" }),
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
}));

vi.mock("@/lib/contributor-account", () => ({
  assertContributorComplete: mockAssertContributorComplete,
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

  it("search corpus loader has its own tag and a time-based revalidate, decoupled from wiki-pages (ADR 0011)", () => {
    const call = unstableCacheCalls.find(
      (c) =>
        Array.isArray(c[1]) && (c[1] as string[]).includes("wiki-pages-search"),
    );
    expect(call).toBeDefined();
    const opts = call![2] as { tags: string[]; revalidate?: number };
    // Decoupled from the per-write `wiki-pages` tag so a content-only edit no
    // longer rebuilds the whole corpus on every autosave tick.
    expect(opts.tags).toContain("wiki-search-corpus");
    expect(opts.tags).not.toContain("wiki-pages");
    // Content edits surface via a time-based refresh instead.
    expect(opts.revalidate).toBeGreaterThan(0);
  });
});

describe("cache invalidation — revalidateTag called", () => {
  it("blocks wiki creation before starting a transaction for an incomplete account", async () => {
    mockAssertContributorComplete.mockRejectedValueOnce(
      new Error("ACCOUNT_SETUP_REQUIRED"),
    );

    await expect(
      createWikiPage({ slug: "test", title: "Test", content: "content" }),
    ).rejects.toThrow("ACCOUNT_SETUP_REQUIRED");
    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it("blocks wiki updates before reading the page for an incomplete account", async () => {
    mockAssertContributorComplete.mockRejectedValueOnce(
      new Error("ACCOUNT_SETUP_REQUIRED"),
    );

    await expect(
      updateWikiPage({
        slug: "test",
        title: "Test",
        content: "content",
        expectedVersion: 1,
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("ACCOUNT_SETUP_REQUIRED");
    expect(mockDbQueryWikiPages.findFirst).not.toHaveBeenCalled();
  });

  it("blocks wiki rollback before reading the revision for an incomplete account", async () => {
    mockAssertContributorComplete.mockRejectedValueOnce(
      new Error("ACCOUNT_SETUP_REQUIRED"),
    );

    await expect(rollbackToRevision("page-1", "revision-1")).rejects.toThrow(
      "ACCOUNT_SETUP_REQUIRED",
    );
    expect(mockDbQueryWikiRevisions.findFirst).not.toHaveBeenCalled();
  });

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

  // Build a transaction mock for writeWikiPage. `latestRevision` is what the
  // "most recent revision" select returns; the update/insert spies let a test
  // assert whether the write coalesced (updates the revision) or inserted a new
  // one. See ADR 0009.
  function makeWriteTx(latestRevision: unknown) {
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "1",
            updatedAt: new Date("2024-01-02"),
            version: 2,
          },
        ]),
      }),
    });
    const update = vi.fn().mockReturnValue({
      set,
    });
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const tx = {
      update,
      insert,
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue(latestRevision ? [latestRevision] : []),
            }),
          }),
        }),
      }),
    };
    return { tx, update, insert, set };
  }

  it("updateWikiPage calls revalidateTag", async () => {
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
      updatedAt: new Date("2024-01-01"),
      version: 1,
    });
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => fn(makeWriteTx(null).tx),
    );

    await updateWikiPage({
      slug: "test",
      title: "Updated",
      content: "new",
      expectedVersion: 1,
      expectedUpdatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
  });

  it("uses the integer version for CAS and advances it atomically", async () => {
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
      title: "Test",
      updatedAt: new Date("2024-01-01T00:00:00.123456Z"),
      version: 7,
    });
    let spies!: ReturnType<typeof makeWriteTx>;
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => {
        spies = makeWriteTx(null);
        return fn(spies.tx);
      },
    );

    await updateWikiPage({
      slug: "test",
      title: "Test",
      content: "new",
      expectedVersion: 7,
      expectedUpdatedAt: "2024-01-01T00:00:00.123Z",
    });

    expect(mockEq).toHaveBeenCalledWith("version", 7);
    expect(mockEq).not.toHaveBeenCalledWith("updatedAt", expect.anything());
    expect(mockGte).toHaveBeenCalledWith(
      "updatedAt",
      new Date("2024-01-01T00:00:00.123Z"),
    );
    expect(mockLt).toHaveBeenCalledWith(
      "updatedAt",
      new Date("2024-01-01T00:00:00.124Z"),
    );
    expect(spies.set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ version: expect.anything() }),
    );
  });

  it("updateWikiPage coalesces a same-author edit within the window (updates the latest revision, no insert)", async () => {
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
      updatedAt: new Date("2024-01-01"),
      version: 1,
    });
    let spies!: ReturnType<typeof makeWriteTx>;
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => {
        spies = makeWriteTx({
          id: "rev-1",
          editedBy: "user-1", // same as requireEditor's mocked user
          createdAt: new Date("2024-01-02"), // same instant as the write → in-window
          editSummary: null,
        });
        return fn(spies.tx);
      },
    );

    await updateWikiPage({
      slug: "test",
      title: "Updated",
      content: "new",
      expectedVersion: 1,
      expectedUpdatedAt: "2024-01-01T00:00:00.000Z",
    });

    // page update + in-place revision update = 2 updates; no revision insert.
    expect(spies.update).toHaveBeenCalledTimes(2);
    expect(spies.insert).not.toHaveBeenCalled();
  });

  it("updateWikiPage opens a new revision for a different author (inserts, does not coalesce)", async () => {
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
      updatedAt: new Date("2024-01-01"),
      version: 1,
    });
    let spies!: ReturnType<typeof makeWriteTx>;
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => {
        spies = makeWriteTx({
          id: "rev-1",
          editedBy: "someone-else",
          createdAt: new Date("2024-01-02"),
          editSummary: null,
        });
        return fn(spies.tx);
      },
    );

    await updateWikiPage({
      slug: "test",
      title: "Updated",
      content: "new",
      expectedVersion: 1,
      expectedUpdatedAt: "2024-01-01T00:00:00.000Z",
    });

    // only the page row is updated; the revision is inserted fresh.
    expect(spies.update).toHaveBeenCalledTimes(1);
    expect(spies.insert).toHaveBeenCalledTimes(1);
  });

  it("deleteWikiPage expires page data and route caches", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ id: "1" }] });
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockDbUpdate.mockReturnValue({
      set,
    });

    await deleteWikiPage("1");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        version: expect.anything(),
      }),
    );
    expect(mockIsNull).toHaveBeenCalledWith("deletedAt");
    expect(mockUpdateTag).toHaveBeenCalledWith("wiki-pages");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/wiki", "layout");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/deleted");
  });

  it("restoreWikiPage expires page data and route caches", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ id: "1" }] });
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockDbUpdate.mockReturnValue({
      set,
    });

    await restoreWikiPage("1");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: null,
        version: expect.anything(),
      }),
    );
    expect(mockIsNotNull).toHaveBeenCalledWith("deletedAt");
    expect(mockUpdateTag).toHaveBeenCalledWith("wiki-pages");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/wiki", "layout");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/deleted");
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

// ADR 0011 — the search corpus refreshes only on *structural* change (a page
// appears/disappears or its title changes); a content-only edit rides the
// time-based revalidate instead of rebuilding the corpus every autosave tick.
describe("search corpus refresh — structural vs content", () => {
  const CORPUS = "wiki-search-corpus";

  function makeWriteTx() {
    return {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "1",
                updatedAt: new Date("2024-01-02"),
                version: 2,
              },
            ]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };
  }

  it("createWikiPage refreshes the corpus (a new page is structural)", async () => {
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
    expect(mockRevalidateTag).toHaveBeenCalledWith(CORPUS, "max");
  });

  it("deleteWikiPage refreshes the corpus (page leaves the result set)", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ id: "1" }] });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    await deleteWikiPage("1");
    expect(mockRevalidateTag).toHaveBeenCalledWith(CORPUS, "max");
  });

  it("restoreWikiPage refreshes the corpus (page re-enters the result set)", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ id: "1" }] });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    await restoreWikiPage("1");
    expect(mockRevalidateTag).toHaveBeenCalledWith(CORPUS, "max");
  });

  it("updateWikiPage refreshes the corpus when the title changes", async () => {
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
      title: "Old title",
      updatedAt: new Date("2024-01-01"),
      version: 1,
    });
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => fn(makeWriteTx()),
    );
    await updateWikiPage({
      slug: "test",
      title: "New title",
      content: "new",
      expectedVersion: 1,
      expectedUpdatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith(CORPUS, "max");
  });

  it("updateWikiPage does NOT refresh the corpus for a content-only edit (same title)", async () => {
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
      title: "Same title",
      updatedAt: new Date("2024-01-01"),
      version: 1,
    });
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => fn(makeWriteTx()),
    );
    await updateWikiPage({
      slug: "test",
      title: "Same title",
      content: "different body",
      expectedVersion: 1,
      expectedUpdatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
    expect(mockRevalidateTag).not.toHaveBeenCalledWith(CORPUS, "max");
  });

  it("rollbackToRevision refreshes the corpus when the title changes", async () => {
    mockDbQueryWikiRevisions.findFirst.mockResolvedValue({
      id: "rev-1",
      title: "Old",
      content: "Old content",
    });
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
      title: "Current",
    });
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => fn(makeWriteTx()),
    );
    await rollbackToRevision("1", "rev-1");
    expect(mockRevalidateTag).toHaveBeenCalledWith(CORPUS, "max");
  });

  it("rollbackToRevision does NOT refresh the corpus when the title is unchanged", async () => {
    mockDbQueryWikiRevisions.findFirst.mockResolvedValue({
      id: "rev-1",
      title: "Same",
      content: "Old content",
    });
    mockDbQueryWikiPages.findFirst.mockResolvedValue({
      id: "1",
      slug: "test",
      title: "Same",
    });
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => fn(makeWriteTx()),
    );
    await rollbackToRevision("1", "rev-1");
    expect(mockRevalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
    expect(mockRevalidateTag).not.toHaveBeenCalledWith(CORPUS, "max");
  });

  // The merged (edit-conflict) branch gates on the *post-conflict* title, not
  // the pre-conflict baseline: a body-only edit that survives a clean merge can
  // still overwrite a concurrent rename, which the corpus must reflect.
  const PLATE = (t: string) =>
    JSON.stringify([{ type: "p", children: [{ text: t }] }]);

  function makeConflictTx() {
    return {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // empty → EDIT_CONFLICT
          }),
        }),
      }),
    };
  }

  it("merged branch refreshes the corpus when the clean-merge write reverts a concurrent rename", async () => {
    // X edits body only (data.title unchanged), but Y renamed the page in the
    // meantime; X's clean merge writes data.title, reverting Y's rename.
    let call = 0;
    mockDbQueryWikiPages.findFirst.mockImplementation(async () => {
      call += 1;
      return call === 1
        ? {
            id: "1",
            slug: "test",
            title: "A",
            content: PLATE("shared"),
            version: 1,
          }
        : {
            id: "1",
            slug: "test",
            title: "B", // Y renamed A→B after X loaded the page
            content: PLATE("shared"),
            updatedAt: new Date("2024-01-02"),
            version: 2,
          };
    });
    let firstWrite = true;
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => {
        const tx = firstWrite ? makeConflictTx() : makeWriteTx();
        firstWrite = false;
        return fn(tx);
      },
    );
    await updateWikiPage({
      slug: "test",
      title: "A", // unchanged vs pre-conflict baseline, but differs from latest "B"
      content: PLATE("X body edit"),
      baseContent: PLATE("shared"),
      expectedVersion: 1,
      expectedUpdatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith(CORPUS, "max");
  });

  it("merged branch does NOT refresh the corpus when the concurrent edit left the title unchanged", async () => {
    let call = 0;
    mockDbQueryWikiPages.findFirst.mockImplementation(async () => {
      call += 1;
      return call === 1
        ? {
            id: "1",
            slug: "test",
            title: "A",
            content: PLATE("shared"),
            version: 1,
          }
        : {
            id: "1",
            slug: "test",
            title: "A", // concurrent write was content-only
            content: PLATE("shared"),
            updatedAt: new Date("2024-01-02"),
            version: 2,
          };
    });
    let firstWrite = true;
    mockDbTransaction.mockImplementation(
      async (fn: (...a: unknown[]) => unknown) => {
        const tx = firstWrite ? makeConflictTx() : makeWriteTx();
        firstWrite = false;
        return fn(tx);
      },
    );
    await updateWikiPage({
      slug: "test",
      title: "A",
      content: PLATE("X body edit"),
      baseContent: PLATE("shared"),
      expectedVersion: 1,
      expectedUpdatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
    expect(mockRevalidateTag).not.toHaveBeenCalledWith(CORPUS, "max");
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
