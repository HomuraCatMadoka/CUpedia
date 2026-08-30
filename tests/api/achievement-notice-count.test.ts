import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetAchievementNoticeCount } = vi.hoisted(() => ({
  mockGetAchievementNoticeCount: vi.fn(),
}));

vi.mock("@/lib/achievement-notice-actions", () => ({
  getAchievementNoticeCount: mockGetAchievementNoticeCount,
}));

import { GET } from "@/app/api/achievement-notices/count/route";

beforeEach(() => {
  mockGetAchievementNoticeCount.mockReset();
});

describe("GET /api/achievement-notices/count", () => {
  it("returns the current user's unread count without caching", async () => {
    mockGetAchievementNoticeCount.mockResolvedValue(3);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ count: 3 });
  });
});
