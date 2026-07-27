import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetSession, mockCookiesGet, mockCookiesSet } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCookiesGet: vi.fn(),
  mockCookiesSet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({
    get: mockCookiesGet,
    set: mockCookiesSet,
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (opts: unknown) => mockGetSession(opts),
    },
  },
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

import {
  appendShameVote,
  getShameVoteCountsForDate,
} from "@/lib/canteen-shame-actions";
import { hktCalendarDate } from "@/lib/canteen-shame-rank";
import {
  mockEnsureAnonSession,
  resetCanteenMockState,
} from "@/lib/canteen-mock";
import { resetVoteRateLimitForTests } from "@/lib/canteen-vote-rate-limit";

const DEMO_CANTEEN_ID = "mock-canteen-demo";

describe("canteen-shame-actions (mock mode)", () => {
  const prevMock = process.env.CANTEEN_MOCK_DATA;
  const prevSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.CANTEEN_MOCK_DATA = "true";
    process.env.AUTH_SECRET = "test-secret";
    resetCanteenMockState();
    resetVoteRateLimitForTests();
    mockGetSession.mockResolvedValue(null);
    mockCookiesGet.mockReturnValue(undefined);
    mockCookiesSet.mockReset();
    mockEnsureAnonSession();
  });

  afterEach(() => {
    process.env.CANTEEN_MOCK_DATA = prevMock;
    process.env.AUTH_SECRET = prevSecret;
    resetCanteenMockState();
    resetVoteRateLimitForTests();
  });

  it("appends a dislike each click; same canteen can be stomped multiple times", async () => {
    await appendShameVote(DEMO_CANTEEN_ID);
    await appendShameVote(DEMO_CANTEEN_ID);
    const today = hktCalendarDate();
    const counts = await getShameVoteCountsForDate(today);
    expect(counts[DEMO_CANTEEN_ID]).toBe(2);
  });

  it("does not cancel on second click", async () => {
    await appendShameVote(DEMO_CANTEEN_ID);
    await appendShameVote(DEMO_CANTEEN_ID);
    await appendShameVote(DEMO_CANTEEN_ID);
    const counts = await getShameVoteCountsForDate(hktCalendarDate());
    expect(counts[DEMO_CANTEEN_ID]).toBe(3);
  });

  it("allows guests via anon session", async () => {
    mockGetSession.mockResolvedValue(null);
    await appendShameVote(DEMO_CANTEEN_ID);
    const counts = await getShameVoteCountsForDate(hktCalendarDate());
    expect(counts[DEMO_CANTEEN_ID]).toBe(1);
  });

  it("rejects unknown canteen", async () => {
    await expect(appendShameVote("missing-canteen")).rejects.toThrow(
      "CANTEEN_NOT_FOUND",
    );
  });
});
