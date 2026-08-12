import { afterEach, describe, expect, it } from "vitest";

import {
  assertArrivalFeedbackRateLimitInTransaction,
  getCampusBusFeedbackRateLimitPerTenMinutes,
} from "@/lib/campus-transport/arrival-observation-store";

function databaseWithCount(value: number) {
  const query = Promise.resolve([
    { value, windowStartedAt: new Date(Date.now() - 60_000) },
  ]);
  const where = () => query;
  const from = () => ({ where });
  return {
    execute: async () => undefined,
    insert: () => ({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    }),
    select: () => ({ from }),
  } as never;
}

describe("campus bus feedback rate limit", () => {
  const originalLimit = process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN;

  afterEach(() => {
    process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = originalLimit;
  });

  it("uses a configurable ten-minute ceiling", () => {
    process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = "7";
    expect(getCampusBusFeedbackRateLimitPerTenMinutes()).toBe(7);
  });

  it("allows the last request below the ceiling and rejects the next", async () => {
    process.env.CAMPUS_BUS_FEEDBACK_RATE_LIMIT_PER_10_MIN = "3";
    await expect(
      assertArrivalFeedbackRateLimitInTransaction(
        "11111111-1111-4111-8111-111111111111",
        databaseWithCount(2),
        new Date(),
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertArrivalFeedbackRateLimitInTransaction(
        "11111111-1111-4111-8111-111111111111",
        databaseWithCount(3),
        new Date(),
      ),
    ).rejects.toThrow("CAMPUS_BUS_FEEDBACK_RATE_LIMIT_EXCEEDED");
  });
});
