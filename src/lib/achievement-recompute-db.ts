import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  achievementEvidence,
  achievementProfiles,
  achievementRules,
  courseRatings,
  courses,
  userAchievements,
} from "@/db/schema";
import {
  planAchievementAfterRatingDeletion,
  type AchievementDeletionImpact,
  type RecomputableAchievement,
} from "@/lib/achievement-recompute";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PublicDeletionImpact = {
  kind: AchievementDeletionImpact["kind"];
  nextTier?: "bronze" | "silver" | "gold" | null;
};

export async function recomputeAchievementsBeforeRatingDeletion(
  tx: Transaction,
  userId: string,
  ratingId: string,
  apply: boolean,
): Promise<PublicDeletionImpact> {
  const achievementRows = await tx
    .select({
      id: userAchievements.id,
      tier: userAchievements.tier,
      status: userAchievements.status,
      ruleKey: achievementRules.ruleKey,
      prerequisiteRuleKey: achievementRules.prerequisiteRuleKey,
      subjectCodes: achievementRules.subjectCodes,
      subjectGroups: achievementRules.subjectGroups,
      requiredCount: achievementRules.requiredCount,
    })
    .from(userAchievements)
    .innerJoin(
      achievementRules,
      eq(userAchievements.ruleId, achievementRules.id),
    )
    .where(
      and(
        eq(userAchievements.userId, userId),
        ne(userAchievements.status, "revoked"),
      ),
    );
  const evidenceRows = await tx
    .select({
      achievementId: achievementEvidence.achievementId,
      ratingId: achievementEvidence.ratingId,
    })
    .from(achievementEvidence)
    .innerJoin(
      userAchievements,
      eq(achievementEvidence.achievementId, userAchievements.id),
    )
    .where(eq(userAchievements.userId, userId));
  const ratings = await tx
    .select({
      id: courseRatings.id,
      courseCode: courseRatings.courseCode,
      subject: courses.subject,
    })
    .from(courseRatings)
    .innerJoin(courses, eq(courseRatings.courseCode, courses.code))
    .where(eq(courseRatings.userId, userId));

  const evidenceByAchievement = new Map<string, string[]>();
  for (const row of evidenceRows) {
    const ids = evidenceByAchievement.get(row.achievementId) ?? [];
    ids.push(row.ratingId);
    evidenceByAchievement.set(row.achievementId, ids);
  }
  const achievements: RecomputableAchievement[] = achievementRows.map(
    (row) => ({
      id: row.id,
      tier: row.tier as RecomputableAchievement["tier"],
      status: row.status as RecomputableAchievement["status"],
      ruleKey: row.ruleKey,
      prerequisiteRuleKey: row.prerequisiteRuleKey,
      subjectGroups:
        row.subjectGroups.length > 0
          ? row.subjectGroups
          : [
              {
                subjectCodes: row.subjectCodes,
                requiredCount: row.requiredCount,
              },
            ],
      evidenceRatingIds: evidenceByAchievement.get(row.id) ?? [],
    }),
  );
  const byKey = new Map(achievements.map((item) => [item.ruleKey, item]));

  for (const active of achievements.filter(
    (item) => item.status === "active",
  )) {
    const chain: RecomputableAchievement[] = [];
    let cursor: RecomputableAchievement | undefined = active;
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.prerequisiteRuleKey
        ? byKey.get(cursor.prerequisiteRuleKey)
        : undefined;
    }
    if (!chain.some((item) => item.evidenceRatingIds.includes(ratingId))) {
      continue;
    }

    const chainIds = new Set(chain.map((item) => item.id));
    const occupiedOutsideChain = new Set(
      evidenceRows
        .filter((row) => !chainIds.has(row.achievementId))
        .map((row) => row.ratingId),
    );
    const blockedActiveTiers = new Set<"silver" | "gold">(
      achievements
        .filter(
          (item) =>
            item.status === "active" &&
            item.id !== active.id &&
            item.tier !== "bronze",
        )
        .map((item) => item.tier as "silver" | "gold"),
    );
    const impact = planAchievementAfterRatingDeletion({
      deletedRatingId: ratingId,
      ratings,
      achievements: chain,
      occupiedOutsideChain,
      blockedActiveTiers,
    });
    if (impact.kind === "unchanged") return impact;
    if (!apply) return { kind: impact.kind, nextTier: impact.nextTier };

    await tx
      .delete(achievementEvidence)
      .where(
        inArray(
          achievementEvidence.achievementId,
          impact.affectedAchievementIds,
        ),
      );
    const ratingCourseCodes = new Map(
      ratings.map((rating) => [rating.id, rating.courseCode]),
    );
    const evidence = Object.entries(impact.evidenceByAchievement).flatMap(
      ([achievementId, ratingIds]) =>
        ratingIds.map((nextRatingId) => ({
          achievementId,
          ratingId: nextRatingId,
          courseCode: ratingCourseCodes.get(nextRatingId)!,
        })),
    );
    if (evidence.length) await tx.insert(achievementEvidence).values(evidence);

    const now = new Date();
    for (const item of chain) {
      const retained = Object.hasOwn(impact.evidenceByAchievement, item.id);
      const status =
        item.id === impact.nextActiveAchievementId
          ? "active"
          : retained
            ? "superseded"
            : "revoked";
      await tx
        .update(userAchievements)
        .set({ status, revokedAt: status === "revoked" ? now : null })
        .where(eq(userAchievements.id, item.id));
    }
    if (impact.nextActiveAchievementId !== active.id) {
      await tx
        .update(achievementProfiles)
        .set({
          primaryAchievementId: impact.nextActiveAchievementId,
          updatedAt: now,
        })
        .where(
          and(
            eq(achievementProfiles.userId, userId),
            eq(achievementProfiles.primaryAchievementId, active.id),
          ),
        );
    }
    return { kind: impact.kind, nextTier: impact.nextTier };
  }

  return { kind: "unchanged" };
}
