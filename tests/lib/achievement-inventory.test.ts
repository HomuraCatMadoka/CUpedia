import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQueue, dbChain, mockRequireAuth } = vi.hoisted(() => {
  const queue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "innerJoin"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(queue.length ? queue.shift() : []).then(resolve);
  return {
    dbQueue: queue,
    dbChain: chain,
    mockRequireAuth: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { select: () => dbChain } }));
vi.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

import {
  getMyProfessionalAchievementInventory,
  getProfessionalAchievementInventoryForUser,
} from "@/lib/achievement-inventory";

type Tier = "bronze" | "silver" | "gold";

function rule(
  programmeKey: string,
  badgeCode: string,
  tier: Tier,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `${programmeKey}-${tier}-v2`,
    programmeKey,
    ruleKey: `${programmeKey}-${tier}`,
    version: 2,
    displayName: `${badgeCode} ${tier}`,
    description: `${badgeCode} description`,
    badgeCode,
    tier,
    subjectCodes: [badgeCode],
    subjectGroups: [{ subjectCodes: [badgeCode], requiredCount: 4 }],
    requiredCount: 4,
    prerequisiteRuleKey:
      tier === "bronze"
        ? null
        : `${programmeKey}-${tier === "silver" ? "bronze" : "silver"}`,
    ...overrides,
  };
}

function owned(
  sourceRule: ReturnType<typeof rule>,
  status: "active" | "superseded" | "revoked",
  overrides: Record<string, unknown> = {},
) {
  return {
    ...sourceRule,
    achievementId: `${sourceRule.ruleKey}-achievement`,
    ruleId: sourceRule.id,
    category: "professional",
    status,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.length = 0;
  mockRequireAuth.mockResolvedValue({ id: "user-1" });
});

describe("professional achievement inventory", () => {
  it("returns the actual silver-to-gold sequence and aggregate group progress", async () => {
    const silver = rule("imsc", "IMSC", "silver", {
      prerequisiteRuleKey: null,
      description: "跨学科数学与科学教育：完成跨学科课程组合。",
      subjectCodes: ["MATH", "IMSC", "PHYS"],
      subjectGroups: [
        { subjectCodes: ["MATH"], requiredCount: 4 },
        { subjectCodes: ["IMSC"], requiredCount: 2 },
        { subjectCodes: ["PHYS"], requiredCount: 2 },
      ],
      requiredCount: 8,
    });
    const gold = rule("imsc", "IMSC", "gold", {
      prerequisiteRuleKey: "imsc-silver",
    });
    dbQueue.push(
      [silver, gold],
      [1, 2, 3, 4].map((index) => ({
        id: `rating-${index}`,
        courseCode: `MATH${index}010`,
        subject: "MATH",
      })),
      [],
      [],
    );

    const [item] = await getProfessionalAchievementInventoryForUser("user-1");

    expect(item.displayName).toBe("跨学科数学与科学教育");
    expect(item.tiers).toEqual([
      { tier: "silver", ruleId: silver.id, status: "locked" },
      { tier: "gold", ruleId: gold.id, status: "locked" },
    ]);
    expect(item.current).toBeNull();
    expect(item.next).toMatchObject({
      ruleId: silver.id,
      tier: "silver",
      matchedCount: 4,
      requiredCount: 8,
      eligible: false,
      prerequisiteSatisfied: true,
      slotAvailable: true,
      action: "claim",
      subjectGroups: [
        { subjectCodes: ["MATH"], matchedCount: 4, requiredCount: 4 },
        { subjectCodes: ["IMSC"], matchedCount: 0, requiredCount: 2 },
        { subjectCodes: ["PHYS"], matchedCount: 0, requiredCount: 2 },
      ],
    });
    expect(JSON.stringify(item)).not.toContain("rating-");
    expect(JSON.stringify(item)).not.toContain("MATH1010");
  });

  it("marks superseded tiers completed and keeps an old-version active tier current", async () => {
    const bronzeV2 = rule("math", "MATH", "bronze");
    const silverV2 = rule("math", "MATH", "silver");
    const goldV2 = rule("math", "MATH", "gold");
    const bronzeV1 = rule("math", "MATH", "bronze", {
      id: "math-bronze-v1",
      version: 1,
    });
    const silverV1 = rule("math", "MATH", "silver", {
      id: "math-silver-v1",
      version: 1,
      displayName: "原版数学银标",
      description: "original",
    });
    dbQueue.push(
      [bronzeV2, silverV2, goldV2],
      [9, 10, 11, 12].map((index) => ({
        id: `new-${index}`,
        courseCode: `MATH${index}10`,
        subject: "MATH",
      })),
      Array.from({ length: 8 }, (_, index) => ({
        ratingId: `used-${index + 1}`,
      })),
      [owned(bronzeV1, "superseded"), owned(silverV1, "active")],
    );

    const [item] = await getProfessionalAchievementInventoryForUser("user-1");

    expect(item.displayName).toBe("原版数学");
    expect(item.tiers).toEqual([
      { tier: "bronze", ruleId: bronzeV1.id, status: "completed" },
      { tier: "silver", ruleId: silverV1.id, status: "current" },
      { tier: "gold", ruleId: goldV2.id, status: "locked" },
    ]);
    expect(item.current).toEqual({
      achievementId: "math-silver-achievement",
      ruleId: silverV1.id,
      tier: "silver",
    });
    expect(item.next).toMatchObject({
      ruleId: goldV2.id,
      tier: "gold",
      matchedCount: 4,
      requiredCount: 4,
      eligible: true,
      action: "upgrade",
    });
  });

  it("does not offer a superseded source again while a fusion consumes it", async () => {
    const bronze = rule("math", "MATH", "bronze");
    const silver = rule("math", "MATH", "silver");
    const personGold = rule("person-newton", "NEWT", "gold", {
      programmeKey: null,
      category: "person",
      prerequisiteRuleKey: null,
    });
    dbQueue.push(
      [bronze, silver],
      [1, 2, 3, 4].map((index) => ({
        id: `rating-${index}`,
        courseCode: `MATH${index}010`,
        subject: "MATH",
      })),
      [1, 2, 3, 4].map((index) => ({ ratingId: `rating-${index}` })),
      [
        owned(bronze, "superseded"),
        owned(personGold, "active", {
          achievementId: "newton-achievement",
          category: "person",
        }),
      ],
    );

    const [item] = await getProfessionalAchievementInventoryForUser("user-1");

    expect(item.tiers).toEqual([
      { tier: "bronze", ruleId: bronze.id, status: "completed" },
      { tier: "silver", ruleId: silver.id, status: "locked" },
    ]);
    expect(item.current).toBeNull();
    expect(item.next).toBeNull();
  });

  it("does not let a person achievement occupy a professional tier slot", async () => {
    const silver = rule("imsc", "IMSC", "silver", {
      prerequisiteRuleKey: null,
    });
    const personGold = rule("person-newton", "NEWT", "gold", {
      programmeKey: null,
      prerequisiteRuleKey: null,
    });
    dbQueue.push(
      [silver],
      [1, 2, 3, 4].map((index) => ({
        id: `rating-${index}`,
        courseCode: `IMSC${index}010`,
        subject: "IMSC",
      })),
      [],
      [
        owned(personGold, "active", {
          achievementId: "newton-achievement",
          category: "person",
        }),
      ],
    );

    const [item] = await getProfessionalAchievementInventoryForUser("user-1");

    expect(item.next).toMatchObject({
      tier: "silver",
      eligible: true,
      slotAvailable: true,
    });
  });

  it("authenticates the current-user wrapper", async () => {
    dbQueue.push([], [], [], []);

    await expect(getMyProfessionalAchievementInventory()).resolves.toEqual([]);
    expect(mockRequireAuth).toHaveBeenCalledOnce();
  });
});
