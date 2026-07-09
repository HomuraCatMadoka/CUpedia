import { describe, it, expect, beforeEach } from "vitest";
import {
  checkOcrRateLimit,
  getOcrRateLimitPerHour,
  resetOcrRateLimitForTests,
} from "@/lib/canteen-import-rate-limit";

describe("canteen-import-rate-limit", () => {
  beforeEach(() => {
    resetOcrRateLimitForTests();
  });

  it("allows requests under the hourly limit", () => {
    const limit = getOcrRateLimitPerHour();
    for (let i = 0; i < limit; i += 1) {
      expect(checkOcrRateLimit("admin-1")).toBe(true);
    }
    expect(checkOcrRateLimit("admin-1")).toBe(false);
  });

  it("tracks limits per admin user", () => {
    expect(checkOcrRateLimit("admin-a")).toBe(true);
    expect(checkOcrRateLimit("admin-b")).toBe(true);
  });
});
