import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isNotNull, and, eq } from "drizzle-orm";
import { encodeAnonSessionCookie } from "@/lib/canteen-anon-session";
import { canteenDishVotes, canteenMenuItems } from "@/db/schema";
import { resetVoteRateLimitForTests } from "@/lib/canteen-vote-rate-limit";

const {
  mockGetSession,
  mockCookiesGet,
  mockCookiesSet,
  mockDbQueryUsers,
  mockDbSelect,
  mockDbInsert,
  mockUnstableCache,
  mockRevalidateTag,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCookiesGet: vi.fn(),
  mockCookiesSet: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockUnstableCache: vi.fn((fn: unknown) => fn),
  mockRevalidateTag: vi.fn(),
}));

let selectQueue: unknown[] = [];

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
  unstable_cache: mockUnstableCache,
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

vi.mock("@/db", () => ({
  db: {
    query: { users: mockDbQueryUsers },
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

import { CANTEEN_VOTE_COUNTS_TAG } from "@/lib/canteen-vote-queries";
import {
  getMenuItemVoteCounts,
  getMyVotesForCanteen,
  upsertDishVote,
} from "@/lib/canteen-vote-actions";

const ITEM_ID = "item-1";
const CANTEEN_ID = "canteen-1";
const ANON_SESSION = "33333333-3333-4333-8333-333333333333";

function signedCookie(sessionId = ANON_SESSION) {
  return encodeAnonSessionCookie(sessionId, Date.now() + 60_000);
}

function queueSelectResults(...results: unknown[]) {
  selectQueue = [...results];
  mockDbSelect.mockImplementation(() => {
    const next = selectQueue.shift();
    const promise = Promise.resolve(next);
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.groupBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.then = promise.then.bind(promise);
    return chain;
  });
}

function mockInsertWithConflict() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  mockDbInsert.mockReturnValue({ values });
  return { values, onConflictDoUpdate };
}

describe("canteen-vote-actions (drizzle-mocked pg path)", () => {
  const prevMock = process.env.CANTEEN_MOCK_DATA;
  const prevSecret = process.env.AUTH_SECRET;
  const prevLimit = process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN;

  beforeEach(() => {
    process.env.CANTEEN_MOCK_DATA = "false";
    process.env.AUTH_SECRET = "test-secret";
    delete process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN;
    selectQueue = [];
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
    mockDbQueryUsers.findFirst.mockResolvedValue(null);
    mockCookiesGet.mockReturnValue(undefined);
    mockUnstableCache.mockImplementation((fn: unknown) => fn);
    queueSelectResults([]);
    resetVoteRateLimitForTests();
  });

  afterEach(() => {
    process.env.CANTEEN_MOCK_DATA = prevMock;
    process.env.AUTH_SECRET = prevSecret;
    process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN = prevLimit;
    resetVoteRateLimitForTests();
  });

  it("inserts a vote for an anonymous diner with a signed session cookie", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "canteen_anon_session"
        ? { value: signedCookie() }
        : undefined,
    );
    queueSelectResults([{ id: ITEM_ID }]);
    const { values, onConflictDoUpdate } = mockInsertWithConflict();

    const result = await upsertDishVote(ITEM_ID, "like");

    expect(result).toEqual({ menuItemId: ITEM_ID, vote: "like" });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        menuItemId: ITEM_ID,
        anonymousSessionId: ANON_SESSION,
        vote: "like",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [
          canteenDishVotes.anonymousSessionId,
          canteenDishVotes.menuItemId,
        ],
        targetWhere: isNotNull(canteenDishVotes.anonymousSessionId),
      }),
    );
    expect(mockRevalidateTag).toHaveBeenCalledWith(
      CANTEEN_VOTE_COUNTS_TAG,
      "max",
    );
  });

  it("upserts via onConflictDoUpdate when the same diner changes their vote", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "canteen_anon_session"
        ? { value: signedCookie() }
        : undefined,
    );
    queueSelectResults([{ id: ITEM_ID }]);
    const { onConflictDoUpdate } = mockInsertWithConflict();

    const result = await upsertDishVote(ITEM_ID, "dislike");

    expect(result.vote).toBe("dislike");
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ vote: "dislike" }),
        targetWhere: isNotNull(canteenDishVotes.anonymousSessionId),
      }),
    );
  });

  it("issues a cookie when voting without one, then writes the vote", async () => {
    mockCookiesGet.mockReturnValue(undefined);
    queueSelectResults([{ id: ITEM_ID }]);
    mockInsertWithConflict();

    await upsertDishVote(ITEM_ID, "like");

    expect(mockCookiesSet).toHaveBeenCalled();
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("rejects writes when cookie cannot be established and user is not logged in", async () => {
    queueSelectResults([{ id: ITEM_ID }]);
    mockCookiesGet.mockReturnValue(undefined);
    mockCookiesSet.mockImplementation(() => {
      throw new Error("Cookies disabled");
    });

    await expect(upsertDishVote(ITEM_ID, "like")).rejects.toThrow();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("lets a logged-in diner vote without an anonymous session cookie", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-1",
      banned: false,
    });
    queueSelectResults([{ id: ITEM_ID }]);
    const { values, onConflictDoUpdate } = mockInsertWithConflict();

    await upsertDishVote(ITEM_ID, "like");

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        vote: "like",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [canteenDishVotes.userId, canteenDishVotes.menuItemId],
        targetWhere: isNotNull(canteenDishVotes.userId),
      }),
    );
  });

  it("rejects banned logged-in users", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-banned" } });
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-banned",
      banned: true,
    });
    queueSelectResults([{ id: ITEM_ID }]);

    await expect(upsertDishVote(ITEM_ID, "like")).rejects.toThrow("USER_BANNED");
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("rejects votes for unknown menu items", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "canteen_anon_session"
        ? { value: signedCookie() }
        : undefined,
    );
    queueSelectResults([]);

    await expect(upsertDishVote("missing", "like")).rejects.toThrow(
      "MENU_ITEM_NOT_FOUND",
    );
  });

  it("does not consume rate limit when menu item is missing", async () => {
    process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN = "1";
    resetVoteRateLimitForTests();
    mockCookiesGet.mockImplementation((name: string) =>
      name === "canteen_anon_session"
        ? { value: signedCookie() }
        : undefined,
    );
    queueSelectResults([]);

    await expect(upsertDishVote("missing", "like")).rejects.toThrow(
      "MENU_ITEM_NOT_FOUND",
    );

    queueSelectResults([{ id: ITEM_ID }]);
    mockInsertWithConflict();
    await expect(upsertDishVote(ITEM_ID, "like")).resolves.toEqual({
      menuItemId: ITEM_ID,
      vote: "like",
    });
  });

  it("returns my current vote immediately from the database", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "canteen_anon_session"
        ? { value: signedCookie() }
        : undefined,
    );
    queueSelectResults([{ menuItemId: ITEM_ID, vote: "dislike" }]);

    const mine = await getMyVotesForCanteen(CANTEEN_ID);

    expect(mine[ITEM_ID]).toBe("dislike");
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it("aggregates like and dislike counts from the database", async () => {
    const rows = [{ menuItemId: ITEM_ID, likes: 2, dislikes: 1 }];
    const promise = Promise.resolve(rows);
    mockDbSelect.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.groupBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.then = promise.then.bind(promise);
      return chain;
    });

    const counts = await getMenuItemVoteCounts(CANTEEN_ID);

    expect(mockDbSelect).toHaveBeenCalled();
    expect(counts[ITEM_ID]).toEqual({ likes: 2, dislikes: 1 });
  });

  it("excludes cancelled votes (vote IS NULL) from aggregated counts", async () => {
    let whereArg: unknown;
    const rows = [{ menuItemId: ITEM_ID, likes: 1, dislikes: 0 }];
    const promise = Promise.resolve(rows);
    mockDbSelect.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn((arg: unknown) => {
        whereArg = arg;
        return chain;
      });
      chain.groupBy = vi.fn().mockReturnValue(chain);
      chain.then = promise.then.bind(promise);
      return chain;
    });

    await getMenuItemVoteCounts(CANTEEN_ID);

    expect(whereArg).toEqual(
      and(
        eq(canteenMenuItems.canteenId, CANTEEN_ID),
        isNotNull(canteenDishVotes.vote),
      ),
    );
  });
});
