import {
  evaluateSubjectCountRule,
  type AchievementRating,
} from "@/lib/achievement-evaluator";

export type RecomputableAchievement = {
  id: string;
  tier: "bronze" | "silver" | "gold";
  status: "active" | "superseded" | "revoked";
  ruleKey: string;
  prerequisiteRuleKey: string | null;
  subjectGroups: Array<{ subjectCodes: string[]; requiredCount: number }>;
  evidenceRatingIds: string[];
};

export type AchievementDeletionImpact =
  | { kind: "unchanged" }
  | {
      kind: "preserved" | "downgraded" | "revoked";
      activeAchievementId: string;
      nextActiveAchievementId: string | null;
      nextTier: "bronze" | "silver" | "gold" | null;
      evidenceByAchievement: Record<string, string[]>;
      affectedAchievementIds: string[];
    };

const tierRank = { bronze: 0, silver: 1, gold: 2 } as const;

/** Pure deletion simulation. It recomputes the complete bound rule chain and
 * never exposes the selected evidence to the client-facing impact copy. */
export function planAchievementAfterRatingDeletion({
  deletedRatingId,
  ratings,
  achievements,
  occupiedOutsideChain,
  blockedActiveTiers = new Set(),
}: {
  deletedRatingId: string;
  ratings: AchievementRating[];
  achievements: RecomputableAchievement[];
  occupiedOutsideChain: ReadonlySet<string>;
  blockedActiveTiers?: ReadonlySet<"silver" | "gold">;
}): AchievementDeletionImpact {
  const active = achievements.find((item) => item.status === "active");
  if (!active) return { kind: "unchanged" };

  const byKey = new Map(achievements.map((item) => [item.ruleKey, item]));
  const chain: RecomputableAchievement[] = [];
  let cursor: RecomputableAchievement | undefined = active;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.prerequisiteRuleKey
      ? byKey.get(cursor.prerequisiteRuleKey)
      : undefined;
  }
  if (!chain.some((item) => item.evidenceRatingIds.includes(deletedRatingId))) {
    return { kind: "unchanged" };
  }

  const remaining = ratings.filter((rating) => rating.id !== deletedRatingId);
  for (let end = chain.length; end >= 1; end -= 1) {
    const candidate = chain[end - 1];
    if (
      candidate.tier !== "bronze" &&
      candidate.id !== active.id &&
      blockedActiveTiers.has(candidate.tier)
    ) {
      continue;
    }
    const retained = chain.slice(0, end);
    const groups = retained.flatMap((item) => item.subjectGroups);
    const evaluation = evaluateSubjectCountRule(
      { subjectGroups: groups },
      remaining,
      occupiedOutsideChain,
    );
    if (!evaluation.eligible) continue;

    const evidenceByAchievement: Record<string, string[]> = {};
    let slotOffset = 0;
    for (const item of retained) {
      const slotCount = item.subjectGroups.reduce(
        (total, group) => total + group.requiredCount,
        0,
      );
      evidenceByAchievement[item.id] = evaluation.evidenceRatingIdsBySlot.slice(
        slotOffset,
        slotOffset + slotCount,
      );
      slotOffset += slotCount;
    }
    return {
      kind: candidate.id === active.id ? "preserved" : "downgraded",
      activeAchievementId: active.id,
      nextActiveAchievementId: candidate.id,
      nextTier: candidate.tier,
      evidenceByAchievement,
      affectedAchievementIds: chain.map((item) => item.id),
    };
  }

  return {
    kind: "revoked",
    activeAchievementId: active.id,
    nextActiveAchievementId: null,
    nextTier: null,
    evidenceByAchievement: {},
    affectedAchievementIds: chain.map((item) => item.id),
  };
}

export function highestTier(
  achievements: RecomputableAchievement[],
): "bronze" | "silver" | "gold" | null {
  return (
    achievements
      .filter((item) => item.status === "active")
      .sort((a, b) => tierRank[b.tier] - tierRank[a.tier])[0]?.tier ?? null
  );
}
