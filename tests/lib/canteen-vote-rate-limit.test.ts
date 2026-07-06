import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkVoteRateLimit,
  getVoteRateLimitPerMin,
  resetVoteRateLimitForTests,
} from "@/lib/canteen-vote-rate-limit";

describe("canteen vote rate limit", () => {
  const prevLimit = process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN;

  beforeEach(() => {
    process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN = "3";
    resetVoteRateLimitForTests();
  });

  afterEach(() => {
    process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN = prevLimit;
    resetVoteRateLimitForTests();
  });

  it("allows votes until the per-minute ceiling for a voter key", () => {
    expect(checkVoteRateLimit("anon:session-a")).toBe(true);
    expect(checkVoteRateLimit("anon:session-a")).toBe(true);
    expect(checkVoteRateLimit("anon:session-a")).toBe(true);
    expect(checkVoteRateLimit("anon:session-a")).toBe(false);
  });

  it("tracks anonymous and logged-in voters independently", () => {
    expect(checkVoteRateLimit("anon:session-a")).toBe(true);
    expect(checkVoteRateLimit("user:alice")).toBe(true);
    expect(checkVoteRateLimit("anon:session-b")).toBe(true);
    expect(checkVoteRateLimit("anon:session-a")).toBe(true);
    expect(checkVoteRateLimit("user:alice")).toBe(true);
  });

  it("defaults to 60 votes per minute when env is unset", () => {
    delete process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN;
    expect(getVoteRateLimitPerMin()).toBe(60);
  });
});
