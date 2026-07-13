import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

import {
  assertDanmakuRateLimit,
  getDanmakuRateLimitPerHour,
} from "@/lib/danmaku-rate-limit";

describe("danmaku rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DANMAKU_RATE_LIMIT_PER_HOUR = "2";
  });

  it("allows when recent count is below limit", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 1 }]),
      }),
    });
    await expect(assertDanmakuRateLimit("user-a")).resolves.toBeUndefined();
  });

  it("throws when recent count reaches limit", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 2 }]),
      }),
    });
    await expect(assertDanmakuRateLimit("user-a")).rejects.toThrow(
      "DANMAKU_RATE_LIMIT_EXCEEDED",
    );
  });

  it("defaults to 5 per hour when env unset", () => {
    delete process.env.DANMAKU_RATE_LIMIT_PER_HOUR;
    expect(getDanmakuRateLimitPerHour()).toBe(5);
  });
});
