import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  achievementEvidence,
  achievementFusionSources,
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
import { evaluateSubjectCountRule } from "@/lib/achievement-evaluator";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PublicDeletionImpact = {
  kind: AchievementDeletionImpact["kind"] | "dismantled";
  nextTier?: "bronze" | "silver" | "gold" | null;
};

/** Replaces fallback ESTR evidence with newly available regular engineering
 * subjects. The full prerequisite chain is matched together so the rewrite
 * preserves every already-redeemed tier and the global one-rating constraint. */
export async function rebindFallbackAchievementEvidenceAfterRatingChange(
  tx: Transaction,
  userId: string,
): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
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
        eq(achievementRules.category, "professional"),
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
  const ratingById = new Map(ratings.map((rating) => [rating.id, rating]));
  const byKey = new Map(achievements.map((item) => [item.ruleKey, item]));
  const prerequisiteKeys = new Set(
    achievements.flatMap((item) =>
      item.prerequisiteRuleKey ? [item.prerequisiteRuleKey] : [],
    ),
  );
  const leaves = achievements.filter(
    (item) => !prerequisiteKeys.has(item.ruleKey),
  );
  let reboundChains = 0;

  for (const leaf of leaves) {
    const chain: RecomputableAchievement[] = [];
    let cursor: RecomputableAchievement | undefined = leaf;
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.prerequisiteRuleKey
        ? byKey.get(cursor.prerequisiteRuleKey)
        : undefined;
    }
    const chainIds = new Set(chain.map((item) => item.id));
    const currentEvidence = chain.flatMap(
      (item) => evidenceByAchievement.get(item.id) ?? [],
    );
    if (
      !currentEvidence.some(
        (ratingId) => ratingById.get(ratingId)?.subject === "ESTR",
      )
    ) {
      continue;
    }

    const occupiedOutsideChain = new Set(
      [...evidenceByAchievement.entries()].flatMap(([achievementId, ids]) =>
        chainIds.has(achievementId) ? [] : ids,
      ),
    );
    const evaluation = evaluateSubjectCountRule(
      { subjectGroups: chain.flatMap((item) => item.subjectGroups) },
      ratings,
      occupiedOutsideChain,
    );
    if (!evaluation.eligible) continue;

    const nextEvidence = new Map<string, string[]>();
    let slotOffset = 0;
    for (const item of chain) {
      const slotCount = item.subjectGroups.reduce(
        (total, group) => total + group.requiredCount,
        0,
      );
      nextEvidence.set(
        item.id,
        evaluation.evidenceRatingIdsBySlot.slice(
          slotOffset,
          slotOffset + slotCount,
        ),
      );
      slotOffset += slotCount;
    }
    const changed = chain.some((item) => {
      const current = [...(evidenceByAchievement.get(item.id) ?? [])].sort();
      const next = [...(nextEvidence.get(item.id) ?? [])].sort();
      return current.join("\0") !== next.join("\0");
    });
    if (!changed) continue;

    await tx
      .delete(achievementEvidence)
      .where(inArray(achievementEvidence.achievementId, [...chainIds]));
    const nextRows = [...nextEvidence.entries()].flatMap(
      ([achievementId, ratingIds]) =>
        ratingIds.map((ratingId) => ({
          achievementId,
          ratingId,
          courseCode: ratingById.get(ratingId)!.courseCode,
        })),
    );
    if (nextRows.length) {
      await tx.insert(achievementEvidence).values(nextRows);
    }
    for (const [achievementId, ratingIds] of nextEvidence) {
      evidenceByAchievement.set(achievementId, ratingIds);
    }
    reboundChains += 1;
  }

  return reboundChains;
}

export async function recomputeAchievementsBeforeRatingDeletion(
  tx: Transaction,
  userId: string,
  ratingId: string,
  apply: boolean,
): Promise<PublicDeletionImpact> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
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
  const fusionLinks = await tx
    .select({
      fusionAchievementId: achievementFusionSources.fusionAchievementId,
      sourceAchievementId: achievementFusionSources.sourceAchievementId,
    })
    .from(achievementFusionSources)
    .innerJoin(
      userAchievements,
      eq(achievementFusionSources.fusionAchievementId, userAchievements.id),
    )
    .where(
      and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.status, "active"),
      ),
    );

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

  for (const link of fusionLinks) {
    const source = achievements.find(
      (item) => item.id === link.sourceAchievementId,
    );
    if (!source) continue;
    const chain: RecomputableAchievement[] = [];
    let cursor: RecomputableAchievement | undefined = source;
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.prerequisiteRuleKey
        ? byKey.get(cursor.prerequisiteRuleKey)
        : undefined;
    }
    if (!chain.some((item) => item.evidenceRatingIds.includes(ratingId))) {
      continue;
    }
    const simulatedChain = chain.map((item) => ({
      ...item,
      status: item.id === source.id ? ("active" as const) : item.status,
    }));
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
            item.id !== link.fusionAchievementId &&
            item.tier !== "bronze",
        )
        .map((item) => item.tier as "silver" | "gold"),
    );
    const impact = planAchievementAfterRatingDeletion({
      deletedRatingId: ratingId,
      ratings,
      achievements: simulatedChain,
      occupiedOutsideChain,
      blockedActiveTiers,
    });
    if (impact.kind === "unchanged") return impact;
    if (!apply) {
      return impact.kind === "preserved"
        ? { kind: "preserved", nextTier: impact.nextTier }
        : { kind: "dismantled", nextTier: null };
    }

    await rewriteAchievementEvidence(tx, impact, ratings);
    if (impact.kind === "preserved") {
      return { kind: "preserved", nextTier: impact.nextTier };
    }

    const allLinks = fusionLinks.filter(
      (item) => item.fusionAchievementId === link.fusionAchievementId,
    );
    const otherSourceIds = allLinks
      .map((item) => item.sourceAchievementId)
      .filter((id) => id !== source.id);
    const now = new Date();
    await tx
      .update(userAchievements)
      .set({ status: "revoked", revokedAt: now })
      .where(eq(userAchievements.id, link.fusionAchievementId));
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
    if (otherSourceIds.length) {
      await tx
        .update(userAchievements)
        .set({ status: "active", revokedAt: null })
        .where(inArray(userAchievements.id, otherSourceIds));
    }
    await tx
      .delete(achievementFusionSources)
      .where(
        eq(
          achievementFusionSources.fusionAchievementId,
          link.fusionAchievementId,
        ),
      );
    const restoredPrimary =
      impact.nextActiveAchievementId ?? otherSourceIds[0] ?? null;
    await tx
      .update(achievementProfiles)
      .set({ primaryAchievementId: restoredPrimary, updatedAt: now })
      .where(
        and(
          eq(achievementProfiles.userId, userId),
          eq(
            achievementProfiles.primaryAchievementId,
            link.fusionAchievementId,
          ),
        ),
      );
    return { kind: "dismantled", nextTier: null };
  }

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

    await rewriteAchievementEvidence(tx, impact, ratings);

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

async function rewriteAchievementEvidence(
  tx: Transaction,
  impact: Exclude<AchievementDeletionImpact, { kind: "unchanged" }>,
  ratings: Array<{ id: string; courseCode: string; subject: string }>,
) {
  await tx
    .delete(achievementEvidence)
    .where(
      inArray(achievementEvidence.achievementId, impact.affectedAchievementIds),
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
}
