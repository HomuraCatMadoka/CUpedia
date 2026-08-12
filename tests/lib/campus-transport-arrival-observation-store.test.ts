import { afterEach, describe, expect, it } from "vitest";

import {
  arrivalFeedbackRateLimitKey,
  assertArrivalFeedbackRateLimitInTransaction,
  getCampusBusFeedbackRateLimitPerTenMinutes,
} from "@/lib/campus-transport/arrival-observation-store";

function databaseWithCount(value: number) {
  const query = Promise.resolve([{ value }]);
  const where = () => query;
  const from = () => ({ where });
  return {
    execute: async () => undefined,
    select: () => ({ from }),
  } as never;
}

describe("campus bus feedback rate limit", () => {
  const originalLimit = process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN;
  const originalSecret = process.env.CAMPUS_BUS_FEEDBACK_HASH_SECRET;

  afterEach(() => {
    process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = originalLimit;
    process.env.CAMPUS_BUS_FEEDBACK_HASH_SECRET = originalSecret;
  });

  it("hashes the network key without storing the source address", () => {
    process.env.CAMPUS_BUS_FEEDBACK_HASH_SECRET = "test-secret";
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
    });

    const key = arrivalFeedbackRateLimitKey(request);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("203.0.113.8");
  });

  it("uses a configurable ten-minute ceiling", () => {
    process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = "7";
    expect(getCampusBusFeedbackRateLimitPerTenMinutes()).toBe(7);
  });

  it("allows the last request below the ceiling and rejects the next", async () => {
    process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = "3";
    await expect(
      assertArrivalFeedbackRateLimitInTransaction(
        "key",
        databaseWithCount(2),
        new Date(),
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertArrivalFeedbackRateLimitInTransaction(
        "key",
        databaseWithCount(3),
        new Date(),
      ),
    ).rejects.toThrow("CAMPUS_BUS_FEEDBACK_RATE_LIMIT_EXCEEDED");
  });
});
