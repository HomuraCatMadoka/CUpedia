import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPublished: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  transaction: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
  updateTag: mocks.updateTag,
}));

vi.mock("next/server", () => ({ connection: vi.fn() }));

vi.mock("@/db", () => ({
  db: {
    query: {
      wikiPages: { findFirst: mocks.findPublished },
    },
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth-guard", () => ({
  getOptionalUser: vi.fn(),
  requireEditor: vi.fn(() => Promise.resolve({ id: "user-1" })),
}));

vi.mock("@/lib/contributor-account", () => ({
  assertContributorComplete: vi.fn((user) => user),
}));

import { publishWikiDraft } from "@/lib/wiki-draft-actions";

const PAGE_ID = "00000000-0000-4000-8000-000000000432";
const published = {
  id: PAGE_ID,
  title: "Published page",
  icon: null,
  content: "[]",
  parentId: null,
  sortOrder: 0,
  deletedAt: null,
  createdBy: "user-1",
  updatedBy: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  version: 1,
  contentGeneration: 0,
};

describe("publishWikiDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPublished.mockResolvedValue(null);
    mocks.transaction.mockResolvedValue(published);
  });

  it("returns the committed page even when every cache refresh fails", async () => {
    const cacheFailure = new Error("cache refresh failed");
    mocks.revalidateTag.mockImplementation(() => {
      throw cacheFailure;
    });
    mocks.updateTag.mockImplementation(() => {
      throw cacheFailure;
    });
    mocks.revalidatePath.mockImplementation(() => {
      throw cacheFailure;
    });

    await expect(publishWikiDraft(PAGE_ID)).resolves.toEqual(published);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2);
    expect(mocks.updateTag).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });
});
