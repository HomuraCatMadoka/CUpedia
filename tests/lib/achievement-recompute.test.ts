import { describe, expect, it } from "vitest";

import {
  planAchievementAfterRatingDeletion,
  type RecomputableAchievement,
} from "@/lib/achievement-recompute";

const ratings = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${index + 1}`,
    courseCode: `MATH${String(index + 1).padStart(4, "0")}`,
    subject: "MATH",
  }));

function chain(tier: "bronze" | "silver" | "gold") {
  const all: RecomputableAchievement[] = [
    {
      id: "bronze",
      tier: "bronze",
      status: tier === "bronze" ? "active" : "superseded",
      ruleKey: "math-bronze",
      prerequisiteRuleKey: null,
      subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
      evidenceRatingIds: ["r1", "r2", "r3", "r4"],
    },
    {
      id: "silver",
      tier: "silver",
      status: tier === "silver" ? "active" : "superseded",
      ruleKey: "math-silver",
      prerequisiteRuleKey: "math-bronze",
      subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
      evidenceRatingIds: ["r5", "r6", "r7", "r8"],
    },
    {
      id: "gold",
      tier: "gold",
      status: "active",
      ruleKey: "math-gold",
      prerequisiteRuleKey: "math-silver",
      subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
      evidenceRatingIds: ["r9", "r10", "r11", "r12"],
    },
  ];
  return all.slice(0, tier === "bronze" ? 1 : tier === "silver" ? 2 : 3);
}

describe("planAchievementAfterRatingDeletion", () => {
  it("rebinds the complete same-tier evidence set when an alternative remains", () => {
    const result = planAchievementAfterRatingDeletion({
      deletedRatingId: "r1",
      ratings: ratings(13),
      achievements: chain("gold"),
      occupiedOutsideChain: new Set(),
    });

    expect(result.kind).toBe("preserved");
    if (result.kind === "preserved") {
      expect(result.nextTier).toBe("gold");
      expect(Object.values(result.evidenceByAchievement).flat()).toHaveLength(
        12,
      );
      expect(Object.values(result.evidenceByAchievement).flat()).not.toContain(
        "r1",
      );
    }
  });

  it("downgrades only after same-tier recomputation fails", () => {
    const result = planAchievementAfterRatingDeletion({
      deletedRatingId: "r1",
      ratings: ratings(12),
      achievements: chain("gold"),
      occupiedOutsideChain: new Set(),
    });

    expect(result).toMatchObject({ kind: "downgraded", nextTier: "silver" });
  });

  it("skips an occupied lower-tier slot and falls back to bronze", () => {
    const result = planAchievementAfterRatingDeletion({
      deletedRatingId: "r1",
      ratings: ratings(8),
      achievements: chain("gold"),
      occupiedOutsideChain: new Set(),
      blockedActiveTiers: new Set(["silver"]),
    });

    expect(result).toMatchObject({ kind: "downgraded", nextTier: "bronze" });
  });

  it("revokes when no permitted tier remains", () => {
    const result = planAchievementAfterRatingDeletion({
      deletedRatingId: "r1",
      ratings: ratings(4),
      achievements: chain("bronze"),
      occupiedOutsideChain: new Set(),
    });

    expect(result).toMatchObject({ kind: "revoked", nextTier: null });
  });

  it("does nothing when the deleted rating is not evidence", () => {
    expect(
      planAchievementAfterRatingDeletion({
        deletedRatingId: "r9",
        ratings: ratings(9),
        achievements: chain("bronze"),
        occupiedOutsideChain: new Set(),
      }),
    ).toEqual({ kind: "unchanged" });
  });
});
