import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queue,
  chain,
  transaction,
  requireAuth,
  getOptionalUser,
  professionalProgress,
  fusionProgress,
  insert,
  update,
} = vi.hoisted(() => {
  const rows: unknown[] = [];
  const query: Record<string, unknown> = {};
  for (const method of [
    "from",
    "where",
    "orderBy",
    "values",
    "set",
    "onConflictDoNothing",
    "returning",
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(rows.length ? rows.shift() : []).then(resolve);
  return {
    queue: rows,
    chain: query,
    transaction: vi.fn(),
    requireAuth: vi.fn(),
    getOptionalUser: vi.fn(),
    professionalProgress: vi.fn(),
    fusionProgress: vi.fn(),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
  getOptionalUser: (...args: unknown[]) => getOptionalUser(...args),
}));
vi.mock("@/lib/achievement-actions", () => ({
  getProfessionalAchievementProgressForUser: (...args: unknown[]) =>
    professionalProgress(...args),
}));
vi.mock("@/lib/achievement-fusion-actions", () => ({
  getPersonTitleProgressForUser: (...args: unknown[]) =>
    fusionProgress(...args),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => chain,
    insert,
    update,
    transaction: (callback: (tx: unknown) => unknown) => transaction(callback),
  },
}));

import {
  getAchievementNoticeCount,
  markAchievementNoticesSeen,
  syncAchievementNoticesForUser,
} from "@/lib/achievement-notice-actions";

const tx = {
  select: () => chain,
  insert,
  update,
  execute: vi.fn(),
};
const eligibleProfessional = {
  ruleId: "rule-v1",
  displayName: "数学铜标",
  tier: "bronze",
  eligible: true,
  redeemed: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  queue.length = 0;
  requireAuth.mockResolvedValue({ id: "user", role: "user" });
  getOptionalUser.mockResolvedValue({ id: "user" });
  professionalProgress.mockResolvedValue([eligibleProfessional]);
  fusionProgress.mockResolvedValue([]);
  transaction.mockImplementation(async (callback) => callback(tx));
});

describe("achievement notice synchronization", () => {
  it("persists and returns a toast only on first eligibility", async () => {
    queue.push(
      [],
      [],
      [],
      [
        {
          opportunityKey: "professional:rule-v1:bronze",
          displayName: "数学铜标",
        },
      ],
    );

    await expect(syncAchievementNoticesForUser("user")).resolves.toEqual([
      {
        opportunityKey: "professional:rule-v1:bronze",
        displayName: "数学铜标",
      },
    ]);
    expect(chain.values).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "user",
        targetId: "rule-v1",
        targetTier: "bronze",
      }),
    ]);
  });

  it("deduplicates repeated synchronization for the same rule version and tier", async () => {
    queue.push(
      [
        {
          opportunityKey: "professional:rule-v1:bronze",
          invalidatedAt: null,
        },
      ],
      [],
      [],
    );

    await expect(syncAchievementNoticesForUser("user")).resolves.toEqual([]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("invalidates stale opportunities without deleting their dedup history", async () => {
    professionalProgress.mockResolvedValue([]);
    queue.push(
      [
        {
          opportunityKey: "professional:rule-v1:bronze",
          invalidatedAt: null,
        },
      ],
      [],
    );

    await syncAchievementNoticesForUser("user");

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ invalidatedAt: expect.any(Date) }),
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects attempts to synchronize another user's notices", async () => {
    await expect(syncAchievementNoticesForUser("other")).rejects.toThrow(
      /无权/,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("counts only unseen current notices and marks them seen", async () => {
    queue.push([{ id: "n1" }, { id: "n2" }], []);
    await expect(getAchievementNoticeCount()).resolves.toBe(2);
    await markAchievementNoticesSeen();
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ seenAt: expect.any(Date) }),
    );
  });
});
