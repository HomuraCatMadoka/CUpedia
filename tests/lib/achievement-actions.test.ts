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
          requiredCount: 4,
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
      matchedCount: 4,
      requiredCount: 4,
      eligible: true,
      redeemed: false,
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
      [{ id: ruleId, subjectCodes: ["MATH"], requiredCount: 4 }],
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
});
