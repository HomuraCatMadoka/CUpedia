import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq, gte } from "drizzle-orm";
import { canteenDanmakuMessages } from "@/db/schema";

const { mockDbExecute, mockDbSelect } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
  mockDbSelect: vi.fn(),
}));

import {
  assertCanteenDanmakuRateLimitInTransaction,
  assertDanmakuRateLimitInTransaction,
  getDanmakuRateLimitPerHour,
} from "@/lib/danmaku-rate-limit";

const database = {
  execute: (...args: unknown[]) => mockDbExecute(...args),
  select: (...args: unknown[]) => mockDbSelect(...args),
};

describe("danmaku rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DANMAKU_RATE_LIMIT_PER_HOUR = "2";
    mockDbExecute.mockResolvedValue(undefined);
  });

  it("locks the hub feed and allows when its recent count is below limit", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 1 }]),
      }),
    });
    await expect(
      assertDanmakuRateLimitInTransaction("user-a", database),
    ).resolves.toBeUndefined();
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });

  it("throws when the hub count reaches the limit", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 2 }]),
      }),
    });
    await expect(
      assertDanmakuRateLimitInTransaction("user-a", database),
    ).rejects.toThrow("DANMAKU_RATE_LIMIT_EXCEEDED");
  });

  it("locks and counts a canteen feed independently", async () => {
    const now = new Date("2026-07-17T08:00:00.000Z");
    const where = vi.fn().mockResolvedValue([{ value: 1 }]);
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where,
      }),
    });

    await expect(
      assertCanteenDanmakuRateLimitInTransaction(
        "user-a",
        "canteen-a",
        database,
        now,
      ),
    ).resolves.toBeUndefined();
    expect(mockDbExecute).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledWith(
      and(
        eq(canteenDanmakuMessages.userId, "user-a"),
        eq(canteenDanmakuMessages.canteenId, "canteen-a"),
        gte(
          canteenDanmakuMessages.createdAt,
          new Date("2026-07-17T07:00:00.000Z"),
        ),
      ),
    );
  });

  it("defaults to 5 per hour when env unset", () => {
    delete process.env.DANMAKU_RATE_LIMIT_PER_HOUR;
    expect(getDanmakuRateLimitPerHour()).toBe(5);
  });
});
