import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }));

vi.mock("@/db", () => ({
  db: { query: { wikiRevisions: { findMany: mockFindMany } } },
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));

import { getRevisions } from "@/lib/wiki-actions";

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindMany.mockResolvedValue([]);
});

describe("getRevisions column projection (#142)", () => {
  it("fetches only the columns the history list renders — not the full content", async () => {
    await getRevisions("page-1");

    const arg = mockFindMany.mock.calls[0][0];
    expect(arg.columns).toBeDefined();
    expect(arg.columns.content).not.toBe(true);
    expect(arg.columns).toMatchObject({
      id: true,
      title: true,
      editSummary: true,
      createdAt: true,
    });
    expect(arg.with.editedByUser.columns.nickname).toBe(true);
  });
});
