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
  getShameVoteCounts,
  getShameVoteCountsForDate,
} from "@/lib/canteen-shame-actions";
import { hktCalendarDate } from "@/lib/canteen-shame-rank";
import {
  mockEnsureAnonSession,
  mockAppendShameVote,
  mockSetVoterUserId,
  resetCanteenMockState,
} from "@/lib/canteen-mock";
import { resetVoteRateLimitForTests } from "@/lib/canteen-vote-rate-limit";

const DEMO_CANTEEN_ID = "mock-canteen-demo";
const VOTING_OPEN_NOW = new Date("2026-09-01T15:59:00.000Z");
const VOTING_CLOSED_NOW = new Date("2026-09-01T16:00:00.000Z");

describe("canteen-shame-actions (mock mode)", () => {
  const prevMock = process.env.CANTEEN_MOCK_DATA;
  const prevSecret = process.env.AUTH_SECRET;
  const prevDaily = process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT;
  const prevRate = process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(VOTING_OPEN_NOW);
    process.env.CANTEEN_MOCK_DATA = "true";
    process.env.AUTH_SECRET = "test-secret";
    delete process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT;
    delete process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN;
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
    if (prevDaily === undefined)
      delete process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT;
    else process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT = prevDaily;
    if (prevRate === undefined)
      delete process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN;
    else process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN = prevRate;
    resetCanteenMockState();
    resetVoteRateLimitForTests();
    vi.useRealTimers();
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

  it("counts votes across dates for the historical ranking", async () => {
    mockAppendShameVote(DEMO_CANTEEN_ID, "2026-07-26");
    mockAppendShameVote(DEMO_CANTEEN_ID, "2026-07-27");
    expect((await getShameVoteCounts())[DEMO_CANTEEN_ID]).toBe(2);
    expect(
      (await getShameVoteCountsForDate("2026-07-27"))[DEMO_CANTEEN_ID],
    ).toBe(1);
  });

  it("allows guests via anon session", async () => {
    mockGetSession.mockResolvedValue(null);
    await appendShameVote(DEMO_CANTEEN_ID);
    const counts = await getShameVoteCountsForDate(hktCalendarDate());
    expect(counts[DEMO_CANTEEN_ID]).toBe(1);
  });

  it("rejects unknown canteen", async () => {
    await expect(appendShameVote("missing-canteen")).resolves.toEqual({
      ok: false,
      code: "CANTEEN_NOT_FOUND",
    });
  });

  it("caps anonymous stomps per HKT day", async () => {
    process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT = "3";
    await appendShameVote(DEMO_CANTEEN_ID);
    await appendShameVote(DEMO_CANTEEN_ID);
    await appendShameVote(DEMO_CANTEEN_ID);
    await expect(appendShameVote(DEMO_CANTEEN_ID)).resolves.toEqual({
      ok: false,
      code: "DAILY_LIMIT_EXCEEDED",
    });
    const counts = await getShameVoteCountsForDate(hktCalendarDate());
    expect(counts[DEMO_CANTEEN_ID]).toBe(3);
  });

  it("keeps the per-minute rate limit for anonymous voters", async () => {
    process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN = "1";
    await appendShameVote(DEMO_CANTEEN_ID);
    await expect(appendShameVote(DEMO_CANTEEN_ID)).resolves.toEqual({
      ok: false,
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("keeps concurrent anonymous stomps within the daily cap", async () => {
    process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT = "3";
    await Promise.allSettled(
      Array.from({ length: 10 }, () => appendShameVote(DEMO_CANTEEN_ID)),
    );
    const counts = await getShameVoteCountsForDate(hktCalendarDate());
    expect(counts[DEMO_CANTEEN_ID]).toBe(3);
  });

  it("rejects stomps after the configured HKT end date", async () => {
    vi.setSystemTime(VOTING_CLOSED_NOW);

    await expect(appendShameVote(DEMO_CANTEEN_ID)).resolves.toEqual({
      ok: false,
      code: "SHAME_VOTING_CLOSED",
    });
  });

  it("does not apply rate limits to logged-in mock voters", async () => {
    process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT = "2";
    process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN = "1";
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "a@link.cuhk.edu.hk" },
    });
    mockSetVoterUserId("user-1");
    await appendShameVote(DEMO_CANTEEN_ID);
    await appendShameVote(DEMO_CANTEEN_ID);
    await appendShameVote(DEMO_CANTEEN_ID);
    const counts = await getShameVoteCountsForDate(hktCalendarDate());
    expect(counts[DEMO_CANTEEN_ID]).toBe(3);
  });
});
