import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkDanmakuRateLimit,
  getDanmakuRateLimitPerHour,
  resetDanmakuRateLimitForTests,
} from "@/lib/danmaku-rate-limit";

describe("danmaku rate limit", () => {
  const prev = process.env.DANMAKU_RATE_LIMIT_PER_HOUR;

  beforeEach(() => {
    process.env.DANMAKU_RATE_LIMIT_PER_HOUR = "2";
    resetDanmakuRateLimitForTests();
  });

  afterEach(() => {
    process.env.DANMAKU_RATE_LIMIT_PER_HOUR = prev;
    resetDanmakuRateLimitForTests();
  });

  it("allows posts until hourly ceiling per user", () => {
    expect(checkDanmakuRateLimit("user-a")).toBe(true);
    expect(checkDanmakuRateLimit("user-a")).toBe(true);
    expect(checkDanmakuRateLimit("user-a")).toBe(false);
  });

  it("tracks users independently", () => {
    expect(checkDanmakuRateLimit("user-a")).toBe(true);
    expect(checkDanmakuRateLimit("user-b")).toBe(true);
  });

  it("defaults to 5 per hour when env unset", () => {
    delete process.env.DANMAKU_RATE_LIMIT_PER_HOUR;
    expect(getDanmakuRateLimitPerHour()).toBe(5);
  });
});
