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
  unstable_cache: (fn: (canteenId: string) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

import {
  ensureCanteenAnonSession,
  getMenuItemVoteCounts,
  getMyVotesForCanteen,
  upsertDishVote,
} from "@/lib/canteen-vote-actions";
import {
  mockEnsureAnonSession,
  resetCanteenMockState,
} from "@/lib/canteen-mock";
import { resetVoteRateLimitForTests } from "@/lib/canteen-vote-rate-limit";

const DEMO_ITEM_ID = "mock-item-demo";

describe("canteen-vote-actions (mock mode)", () => {
  const prevMock = process.env.CANTEEN_MOCK_DATA;
  const prevSecret = process.env.AUTH_SECRET;
  const prevRate = process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN;

  beforeEach(() => {
    process.env.CANTEEN_MOCK_DATA = "true";
    process.env.AUTH_SECRET = "test-secret";
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
    process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN = prevRate;
    resetCanteenMockState();
    resetVoteRateLimitForTests();
  });

  it("upserts like, changes to dislike, then cancels", async () => {
    await upsertDishVote(DEMO_ITEM_ID, "like");
    let counts = await getMenuItemVoteCounts("mock-canteen-demo");
    expect(counts[DEMO_ITEM_ID]).toEqual({ likes: 1, dislikes: 0 });

    await upsertDishVote(DEMO_ITEM_ID, "dislike");
    counts = await getMenuItemVoteCounts("mock-canteen-demo");
    expect(counts[DEMO_ITEM_ID]).toEqual({ likes: 0, dislikes: 1 });

    await upsertDishVote(DEMO_ITEM_ID, null);
    counts = await getMenuItemVoteCounts("mock-canteen-demo");
    expect(counts[DEMO_ITEM_ID]).toBeUndefined();
  });

  it("returns my vote state without counting cancelled votes in aggregates", async () => {
    await upsertDishVote(DEMO_ITEM_ID, "like");
    const mine = await getMyVotesForCanteen("mock-canteen-demo");
    expect(mine[DEMO_ITEM_ID]).toBe("like");

    await upsertDishVote(DEMO_ITEM_ID, null);
    const afterCancel = await getMyVotesForCanteen("mock-canteen-demo");
    expect(afterCancel[DEMO_ITEM_ID]).toBeUndefined();
  });

  it("uses userId identity when logged in", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    await upsertDishVote(DEMO_ITEM_ID, "like");
    const mine = await getMyVotesForCanteen("mock-canteen-demo");
    expect(mine[DEMO_ITEM_ID]).toBe("like");
  });

  it("returns 429 when vote rate limit exceeded", async () => {
    process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN = "2";
    resetVoteRateLimitForTests();
    await upsertDishVote(DEMO_ITEM_ID, "like");
    await upsertDishVote(DEMO_ITEM_ID, "dislike");
    await expect(upsertDishVote(DEMO_ITEM_ID, "like")).rejects.toThrow(
      "RATE_LIMIT_EXCEEDED",
    );
  });

  it("ensureCanteenAnonSession sets cookie when missing", async () => {
    process.env.CANTEEN_MOCK_DATA = "false";
    const sessionId = await ensureCanteenAnonSession();
    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(mockCookiesSet).toHaveBeenCalled();
  });

  it("rejects vote when cookies cannot be set in DB mode", async () => {
    process.env.CANTEEN_MOCK_DATA = "false";
    mockCookiesGet.mockReturnValue(undefined);
    mockGetSession.mockResolvedValue(null);
    mockCookiesSet.mockImplementation(() => {
      throw new Error("Cookies disabled");
    });
    await expect(upsertDishVote(DEMO_ITEM_ID, "like")).rejects.toThrow();
  });

  it("allows anonymous and logged-in ballots on the same dish (MVP dual vote)", async () => {
    await upsertDishVote(DEMO_ITEM_ID, "like");
    mockGetSession.mockResolvedValue({ user: { id: "user-dual" } });
    await upsertDishVote(DEMO_ITEM_ID, "dislike");
    const counts = await getMenuItemVoteCounts("mock-canteen-demo");
    expect(counts[DEMO_ITEM_ID]).toEqual({ likes: 1, dislikes: 1 });
  });

  it("rejects invalid vote values", async () => {
    await expect(upsertDishVote(DEMO_ITEM_ID, "maybe")).rejects.toThrow(
      "INVALID_VOTE",
    );
  });
});
