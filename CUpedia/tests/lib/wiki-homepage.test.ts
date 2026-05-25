import { describe, it, expect, vi, beforeEach } from "vitest";

const subqueryRef = { cnt: "cnt_col", parentId: "parentId_col" };

const mockFindMany = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    query: { wikiPages: { findMany: (...args: any[]) => mockFindMany(...args) } },
  },
}));

vi.mock("@/db/schema", () => ({
  wikiPages: {
    id: "id",
    slug: "slug",
    title: "title",
    parentId: "parentId",
    deletedAt: "deletedAt",
    sortOrder: "sortOrder",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  sql: Object.assign(
    (...args: any[]) => ({ as: vi.fn(() => "childCount_col"), args }),
    { raw: vi.fn() }
  ),
  count: vi.fn(() => ({ as: vi.fn(() => "cnt_col") })),
}));

import { getCategoryCards, getRecentPages } from "@/lib/wiki-homepage";

describe("getCategoryCards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns top-level pages with child counts", async () => {
    const expected = [
      { id: "1", slug: "guide", title: "觅食指南", childCount: 5 },
      { id: "2", slug: "canteen", title: "校内觅食", childCount: 3 },
    ];

    const subqueryChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      as: vi.fn().mockReturnValue(subqueryRef),
    };

    const mainChain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(expected),
    };

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? subqueryChain : mainChain;
    });

    const result = await getCategoryCards();

    expect(result).toEqual(expected);
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });
});

describe("getRecentPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns recently updated pages with author nickname", async () => {
    const mockPages = [
      {
        id: "1",
        slug: "guide/late-night",
        title: "后半夜觅食",
        updatedAt: new Date("2026-05-20"),
        updatedByUser: { nickname: "wyh" },
      },
    ];
    mockFindMany.mockResolvedValue(mockPages);

    const result = await getRecentPages();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("后半夜觅食");
    expect(result[0].updatedByUser.nickname).toBe("wyh");
  });
});
