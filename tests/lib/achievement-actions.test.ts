import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const {
  dbQueue,
  dbChain,
  dbTransaction,
  mockRequireAdmin,
  mockRequireAuth,
  mockRevalidatePath,
} = vi.hoisted(() => {
  const queue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "where",
    "limit",
    "orderBy",
    "innerJoin",
    "values",
    "set",
    "returning",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(queue.length ? queue.shift() : []).then(resolve);
  return {
    dbQueue: queue,
    dbChain: chain,
    dbTransaction: vi.fn(),
    mockRequireAdmin: vi.fn(),
    mockRequireAuth: vi.fn(),
    mockRevalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => dbChain,
    transaction: (callback: (tx: unknown) => unknown) =>
      dbTransaction(callback),
  },
}));

import {
  createProfessionalAchievementRule,
  getMyProfessionalAchievementProgress,
  redeemProfessionalAchievement,
} from "@/lib/achievement-actions";

const tx = {
  select: () => dbChain,
  insert: () => dbChain,
  update: () => dbChain,
  execute: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.length = 0;
  mockRequireAdmin.mockResolvedValue({
    id: "00000000-0000-4000-a000-000000000001",
  });
  mockRequireAuth.mockResolvedValue({
    id: "00000000-0000-4000-a000-000000000002",
  });
  dbTransaction.mockImplementation(async (callback) => callback(tx));
});

describe("professional achievement rules", () => {
  it("requires admin authorization before creating a rule", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      createProfessionalAchievementRule({
        ruleKey: "math-bronze",
        version: 1,
        displayName: "数学铜标",
        badgeCode: "MATH",
        subjectCodes: ["MATH"],
        requiredCount: 4,
        enabled: true,
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("rejects lowercase badge and subject codes before writing", async () => {
    await expect(
      createProfessionalAchievementRule({
        ruleKey: "math-bronze",
        version: 1,
        displayName: "数学铜标",
        badgeCode: "math",
        subjectCodes: ["math"],
        requiredCount: 4,
      }),
    ).rejects.toThrow(/四位大写/);
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it("stores and enables a versioned generic subject-count rule", async () => {
    dbQueue.push([], [{ id: "rule-1" }]);

    await expect(
      createProfessionalAchievementRule({
        ruleKey: "math-bronze",
        version: 2,
        displayName: "数学铜标",
        badgeCode: "MATH",
        subjectCodes: ["MATH"],
        requiredCount: 4,
        enabled: true,
      }),
    ).resolves.toEqual({ id: "rule-1" });

    const values = dbChain.values as Mock;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: "math-bronze",
        version: 2,
        badgeCode: "MATH",
        subjectCodes: ["MATH"],
        requiredCount: 4,
        enabled: true,
      }),
    );
  });

  it("stores mixed subject groups and tier prerequisites", async () => {
    dbQueue.push([], [{ id: "rule-silver" }]);

    await createProfessionalAchievementRule({
      ruleKey: "csci-silver",
      version: 1,
      displayName: "计算机银标",
      badgeCode: "CSCI",
      tier: "silver",
      subjectGroups: [
        { subjectCodes: ["ENGG"], requiredCount: 2 },
        { subjectCodes: ["CSCI"], requiredCount: 2 },
      ],
      prerequisiteRuleKey: "csci-bronze",
      enabled: true,
    });

    expect(dbChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "silver",
        subjectCodes: ["ENGG", "CSCI"],
        subjectGroups: [
          { subjectCodes: ["ENGG"], requiredCount: 2 },
          { subjectCodes: ["CSCI"], requiredCount: 2 },
        ],
        requiredCount: 4,
        prerequisiteRuleKey: "csci-bronze",
      }),
    );
  });
});

describe("professional achievement progress and redemption", () => {
  it("shows aggregate candidate progress without evidence courses", async () => {
    dbQueue.push(
      [
        {
          id: "rule-1",
          displayName: "数学铜标",
          description: "",
          badgeCode: "MATH",
          subjectCodes: ["MATH"],
          subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
          requiredCount: 4,
          ruleKey: "math-bronze",
          version: 1,
          tier: "bronze",
          prerequisiteRuleKey: null,
        },
      ],
      [
        { id: "r1", courseCode: "MATH1010", subject: "MATH" },
        { id: "r2", courseCode: "MATH2010", subject: "MATH" },
        { id: "r3", courseCode: "MATH3010", subject: "MATH" },
        { id: "r4", courseCode: "MATH4010", subject: "MATH" },
      ],
      [],
      [],
    );

    const [progress] = await getMyProfessionalAchievementProgress();
    expect(progress).toEqual({
      ruleId: "rule-1",
      displayName: "数学铜标",
      description: "",
      badgeCode: "MATH",
      tier: "bronze",
      matchedCount: 4,
      requiredCount: 4,
      eligible: true,
      redeemed: false,
      prerequisiteSatisfied: true,
      slotAvailable: true,
    });
    expect(progress).not.toHaveProperty("evidenceRatingIds");
  });

  it("atomically stores the badge and its internal evidence", async () => {
    const ruleId = "00000000-0000-4000-a000-000000000099";
    const ratingRows = [1, 2, 3, 4].map((number) => ({
      id: `00000000-0000-4000-a000-00000000000${number}`,
      courseCode: `MATH${number}010`,
      subject: "MATH",
    }));
    dbQueue.push(
      [
        {
          id: ruleId,
          ruleKey: "math-bronze",
          tier: "bronze",
          subjectCodes: ["MATH"],
          subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
          requiredCount: 4,
          prerequisiteRuleKey: null,
        },
      ],
      [],
      ratingRows,
      [],
      [{ id: "achievement-1" }],
      [],
    );

    await expect(redeemProfessionalAchievement(ruleId)).resolves.toEqual({
      id: "achievement-1",
    });
    const values = dbChain.values as Mock;
    expect(values).toHaveBeenLastCalledWith(
      ratingRows.map((rating) => ({
        achievementId: "achievement-1",
        ratingId: rating.id,
        courseCode: rating.courseCode,
      })),
    );
    expect(dbTransaction).toHaveBeenCalledTimes(1);
  });

  it("keeps an owned badge bound to its original rule version", async () => {
    dbQueue.push(
      [
        {
          id: "rule-v2",
          ruleKey: "math-bronze",
          version: 2,
          displayName: "新版数学铜标",
          description: "new",
          badgeCode: "MATH",
          tier: "bronze",
          subjectCodes: ["MATH"],
          subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
          requiredCount: 4,
          prerequisiteRuleKey: null,
        },
      ],
      [],
      [],
      [
        {
          achievementId: "achievement-v1",
          ruleId: "rule-v1",
          status: "active",
          ruleKey: "math-bronze",
          version: 1,
          displayName: "原版数学铜标",
          description: "old",
          badgeCode: "MATH",
          tier: "bronze",
          requiredCount: 4,
        },
      ],
    );

    const [progress] = await getMyProfessionalAchievementProgress();
    expect(progress).toMatchObject({
      ruleId: "rule-v1",
      displayName: "原版数学铜标",
      redeemed: true,
    });
  });

  it("upgrades with four new ratings and supersedes the prerequisite", async () => {
    const ruleId = "00000000-0000-4000-a000-000000000099";
    const newRatings = [5, 6, 7, 8].map((number) => ({
      id: `00000000-0000-4000-a000-00000000000${number}`,
      courseCode: `MATH${number}010`,
      subject: "MATH",
    }));
    dbQueue.push(
      [
        {
          id: ruleId,
          ruleKey: "math-silver",
          tier: "silver",
          subjectCodes: ["MATH"],
          subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
          requiredCount: 4,
          prerequisiteRuleKey: "math-bronze",
        },
      ],
      [],
      [{ id: "bronze-achievement" }],
      [],
      newRatings,
      [
        { ratingId: "b1" },
        { ratingId: "b2" },
        { ratingId: "b3" },
        { ratingId: "b4" },
      ],
      [{ id: "silver-achievement" }],
      [],
      [],
    );

    await expect(redeemProfessionalAchievement(ruleId)).resolves.toEqual({
      id: "silver-achievement",
    });
    expect(dbChain.values).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-a000-000000000002",
      ruleId,
      tier: "silver",
    });
    expect(dbChain.set).toHaveBeenCalledWith({ status: "superseded" });
  });

  it("rejects an occupied silver slot inside the transaction", async () => {
    const ruleId = "00000000-0000-4000-a000-000000000099";
    dbQueue.push(
      [
        {
          id: ruleId,
          ruleKey: "math-silver",
          tier: "silver",
          subjectCodes: ["MATH"],
          subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
          requiredCount: 4,
          prerequisiteRuleKey: "math-bronze",
        },
      ],
      [],
      [{ id: "bronze-achievement" }],
      [{ id: "other-silver" }],
    );

    await expect(redeemProfessionalAchievement(ruleId)).rejects.toThrow(
      "只能同时拥有一个银标",
    );
    expect(dbChain.values).not.toHaveBeenCalled();
  });

  it("turns a concurrent unique conflict into a retryable message", async () => {
    dbTransaction.mockRejectedValueOnce({ code: "23505" });

    await expect(
      redeemProfessionalAchievement("00000000-0000-4000-a000-000000000099"),
    ).rejects.toThrow("称号兑换发生冲突，请刷新后重试");
  });
});
