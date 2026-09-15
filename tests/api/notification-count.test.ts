import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUnreadNotificationCount } = vi.hoisted(() => ({
  mockGetUnreadNotificationCount: vi.fn(),
}));

vi.mock("@/lib/notification-actions", () => ({
  getUnreadNotificationCount: mockGetUnreadNotificationCount,
}));

import { GET } from "@/app/api/notifications/count/route";

beforeEach(() => {
  mockGetUnreadNotificationCount.mockReset();
});

describe("GET /api/notifications/count", () => {
  it("returns the current user's unread count without caching", async () => {
    mockGetUnreadNotificationCount.mockResolvedValue(3);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ count: 3 });
  });
});
