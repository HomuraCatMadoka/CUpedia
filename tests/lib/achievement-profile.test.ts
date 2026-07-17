import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const { dbQueue, dbChain, mockRequireAuth } = vi.hoisted(() => {
  const queue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "where",
    "limit",
    "values",
    "set",
    "innerJoin",
    "leftJoin",
    "onConflictDoNothing",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(queue.length ? queue.shift() : []).then(resolve);
  return { dbQueue: queue, dbChain: chain, mockRequireAuth: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => dbChain,
    insert: () => dbChain,
    update: () => dbChain,
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getMyAchievementProfile,
  getPublicAchievementShowcase,
} from "@/lib/achievement-profile";
import { setPrimaryAchievement } from "@/lib/achievement-profile-actions";

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.length = 0;
  mockRequireAuth.mockResolvedValue({ id: "user-1" });
});

describe("achievement profiles", () => {
  it("returns a public showcase without review history, evidence, or raw rules", async () => {
    const showcaseId = "00000000-0000-4000-a000-000000000099";
    dbQueue.push(
      [{ userId: "user-1", showcaseId, nickname: "Alice" }],
      [],
      [
        {
          userId: "user-1",
          showcaseId,
          primaryAchievementId: "achievement-1",
          achievementId: "achievement-1",
          displayName: "数学铜标",
          badgeCode: "MATH",
          tier: "bronze",
          category: "professional",
          description: "公开说明",
        },
        {
          userId: "user-1",
          showcaseId,
          primaryAchievementId: "achievement-1",
          achievementId: "achievement-hidden",
          displayName: "隐藏称号",
          badgeCode: "HIDE",
          tier: "gold",
          category: "hidden",
          description: "绝不能公开的条件",
        },
      ],
    );

    const showcase = await getPublicAchievementShowcase(showcaseId);
    expect(showcase).toMatchObject({ showcaseId, nickname: "Alice" });
    expect(showcase).not.toHaveProperty("userId");
    expect(showcase).not.toHaveProperty("reviews");
    expect(showcase?.achievements[0]).toMatchObject({
      publicDescription: "公开说明",
      primary: true,
    });
    expect(showcase?.achievements[1].publicDescription).toBe("");
    expect(showcase?.achievements[0]).not.toHaveProperty("subjectGroups");
    expect(showcase?.achievements[0]).not.toHaveProperty("evidence");
  });

  it("lazily creates one stable random showcase profile for the owner", async () => {
    const showcaseId = "00000000-0000-4000-a000-000000000099";
    dbQueue.push([], [], [], [{ showcaseId }]);

    await expect(getMyAchievementProfile()).resolves.toEqual({
      showcaseId,
      achievements: [],
    });
    expect(dbChain.onConflictDoNothing).toHaveBeenCalled();
    expect(dbChain.values).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("only equips an active achievement owned by the current user", async () => {
    const achievementId = "00000000-0000-4000-a000-000000000088";
    dbQueue.push([], [{ id: achievementId }], []);

    await expect(setPrimaryAchievement(achievementId)).resolves.toBeUndefined();
    expect(dbChain.set as Mock).toHaveBeenCalledWith(
      expect.objectContaining({ primaryAchievementId: achievementId }),
    );
  });

  it("rejects a primary title the user does not own", async () => {
    const achievementId = "00000000-0000-4000-a000-000000000088";
    dbQueue.push([], []);

    await expect(setPrimaryAchievement(achievementId)).rejects.toThrow(
      "只能选择当前拥有的称号",
    );
  });
});
