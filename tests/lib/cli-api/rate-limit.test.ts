import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_READ_LIMIT,
  DEFAULT_WRITE_LIMIT,
  checkRateLimit,
} from "@/lib/cli-api/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit with decreasing remaining", () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit("rl-basic", 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
      expect(result.retryAfterMs).toBe(0);
    }
  });

  it("blocks once the limit is exceeded and reports retryAfterMs", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("rl-block", 3, 60_000);

    const blocked = checkRateLimit("rl-block", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("resets the window after windowMs elapses", () => {
    checkRateLimit("rl-window", 1, 60_000);
    expect(checkRateLimit("rl-window", 1, 60_000).allowed).toBe(false);

    vi.setSystemTime(Date.now() + 60_001);
    const after = checkRateLimit("rl-window", 1, 60_000);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(0);
  });

  it("tracks keys independently", () => {
    checkRateLimit("rl-a", 1, 60_000);
    expect(checkRateLimit("rl-a", 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit("rl-b", 1, 60_000).allowed).toBe(true);
  });

  it("exposes the documented read/write defaults", () => {
    expect(DEFAULT_READ_LIMIT).toBe(100);
    expect(DEFAULT_WRITE_LIMIT).toBe(30);
  });
});
