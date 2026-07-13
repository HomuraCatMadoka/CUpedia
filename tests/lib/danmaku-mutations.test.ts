import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAssertRateLimit, mockDbInsert } = vi.hoisted(() => ({
  mockAssertRateLimit: vi.fn(),
  mockDbInsert: vi.fn(),
}));

vi.mock("@/lib/danmaku-rate-limit", () => ({
  assertDanmakuRateLimit: (...args: unknown[]) => mockAssertRateLimit(...args),
}));

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

import { insertDanmakuForUser } from "@/lib/danmaku-mutations";

describe("danmaku-mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertRateLimit.mockResolvedValue(undefined);
  });

  it("insertDanmakuForUser writes row after rate-limit check", async () => {
    const now = new Date();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "dm-1",
        userId: "user-1",
        content: "期末加油",
        month: "2026-07",
        createdAt: now,
      },
    ]);
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning }),
    });

    const row = await insertDanmakuForUser(
      { id: "user-1", nickname: "Tester" },
      "期末加油",
    );
    expect(row.content).toBe("期末加油");
    expect(mockAssertRateLimit).toHaveBeenCalledWith("user-1");
  });

  it("propagates rate limit errors", async () => {
    mockAssertRateLimit.mockRejectedValue(
      new Error("DANMAKU_RATE_LIMIT_EXCEEDED"),
    );
    await expect(
      insertDanmakuForUser({ id: "user-1", nickname: "T" }, "a"),
    ).rejects.toThrow("DANMAKU_RATE_LIMIT_EXCEEDED");
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});
