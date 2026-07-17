"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
  evaluateSubjectCountRule,
  type AchievementRating,
} from "@/lib/achievement-evaluator";
import { requireAdmin, requireAuth } from "@/lib/auth-guard";
import { ensureAchievementProfile } from "@/lib/achievement-profile";

export type ProfessionalAchievementRuleInput = {
  ruleKey: string;
  version: number;
  displayName: string;
  description?: string;
  badgeCode: string;
  tier?: "bronze" | "silver" | "gold";
  subjectGroups?: Array<{ subjectCodes: string[]; requiredCount: number }>;
  subjectCodes?: string[];
  requiredCount?: number;
  prerequisiteRuleKey?: string;
  enabled?: boolean;
};

export type ProfessionalAchievementProgress = {
  ruleId: string;
  displayName: string;
  description: string;
  badgeCode: string;
  tier: "bronze" | "silver" | "gold";
  matchedCount: number;
  requiredCount: number;
  eligible: boolean;
  redeemed: boolean;
  prerequisiteSatisfied: boolean;
  slotAvailable: boolean;
};

function normalizeRuleInput(input: ProfessionalAchievementRuleInput) {
  const ruleKey = input.ruleKey.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const description = input.description?.trim() ?? "";
  const tier = input.tier ?? "bronze";
  const rawGroups =
    input.subjectGroups ??
    (input.subjectCodes && input.requiredCount
      ? [
          {
            subjectCodes: input.subjectCodes,
            requiredCount: input.requiredCount,
          },
        ]
      : []);
  const subjectGroups = rawGroups.map((group) => ({
    subjectCodes: [...new Set(group.subjectCodes.map((code) => code.trim()))],
    requiredCount: group.requiredCount,
  }));
  const subjectCodes = [
    ...new Set(subjectGroups.flatMap((g) => g.subjectCodes)),
  ];
  const requiredCount = subjectGroups.reduce(
    (total, group) => total + group.requiredCount,
    0,
  );
  const prerequisiteRuleKey =
    input.prerequisiteRuleKey?.trim().toLowerCase() || null;

  if (!/^[a-z0-9-]{2,64}$/.test(ruleKey)) throw new Error("规则标识格式无效");
  if (!displayName || displayName.length > 80)
    throw new Error("称号名称格式无效");
  if (description.length > 240) throw new Error("称号说明最多 240 字");
  if (!/^[A-Z]{4}$/.test(input.badgeCode))
    throw new Error("专业代码须为四位大写字母");
  if (!["bronze", "silver", "gold"].includes(tier))
    throw new Error("称号等级无效");
  if (prerequisiteRuleKey && !/^[a-z0-9-]{2,64}$/.test(prerequisiteRuleKey)) {
    throw new Error("前置规则标识格式无效");
  }
  if (
    subjectGroups.length === 0 ||
    subjectGroups.some(
      (group) =>
        group.subjectCodes.length === 0 ||
        group.subjectCodes.some((code) => !/^[A-Z]{2,6}$/.test(code)) ||
        !Number.isInteger(group.requiredCount) ||
        group.requiredCount < 1,
    )
  ) {
    throw new Error("学科组须包含有效的大写学科代码和门数");
  }
  if (!Number.isInteger(input.version) || input.version < 1)
    throw new Error("规则版本无效");
  if (requiredCount < 1 || requiredCount > 20) {
    throw new Error("课程门数须为 1 至 20");
  }

  return {
    ruleKey,
    displayName,
    description,
    badgeCode: input.badgeCode,
    tier,
    subjectCodes,
    subjectGroups,
    version: input.version,
    requiredCount,
    prerequisiteRuleKey,
    enabled: input.enabled ?? false,
  };
}

export async function createProfessionalAchievementRule(
  input: ProfessionalAchievementRuleInput,
) {
  const admin = await requireAdmin();
  const values = normalizeRuleInput(input);

  const [created] = await db.transaction(async (tx) => {
    if (values.enabled) {
      await tx
        .update(achievementRules)
        .set({ enabled: false, updatedAt: new Date() })
        .where(
          and(
            eq(achievementRules.ruleKey, values.ruleKey),
            ne(achievementRules.version, values.version),
          ),
        );
    }
    return tx
      .insert(achievementRules)
      .values({
        ...values,
        category: "professional",
        createdBy: admin.id,
      })
      .returning({ id: achievementRules.id });
  });

  revalidatePath("/admin/achievement-rules");
  revalidatePath("/courses/achievements");
  return created;
}

export async function getProfessionalAchievementRules() {
  await requireAdmin();
  return db
    .select({
      id: achievementRules.id,
      ruleKey: achievementRules.ruleKey,
      version: achievementRules.version,
      displayName: achievementRules.displayName,
      badgeCode: achievementRules.badgeCode,
      tier: achievementRules.tier,
      subjectCodes: achievementRules.subjectCodes,
      subjectGroups: achievementRules.subjectGroups,
      requiredCount: achievementRules.requiredCount,
      prerequisiteRuleKey: achievementRules.prerequisiteRuleKey,
      enabled: achievementRules.enabled,
    })
    .from(achievementRules)
    .where(eq(achievementRules.category, "professional"))
    .orderBy(achievementRules.ruleKey, achievementRules.version);
}

async function loadUserAchievementInputs(userId: string) {
  const [rules, ratings, occupiedRows, ownedRows] = await Promise.all([
    db
      .select({
        id: achievementRules.id,
        ruleKey: achievementRules.ruleKey,
        version: achievementRules.version,
        displayName: achievementRules.displayName,
        description: achievementRules.description,
        badgeCode: achievementRules.badgeCode,
        tier: achievementRules.tier,
        subjectCodes: achievementRules.subjectCodes,
        subjectGroups: achievementRules.subjectGroups,
        requiredCount: achievementRules.requiredCount,
        prerequisiteRuleKey: achievementRules.prerequisiteRuleKey,
      })
      .from(achievementRules)
      .where(
        and(
          eq(achievementRules.category, "professional"),
          eq(achievementRules.enabled, true),
        ),
      ),
    db
      .select({
        id: courseRatings.id,
        courseCode: courseRatings.courseCode,
        subject: courses.subject,
      })
      .from(courseRatings)
      .innerJoin(courses, eq(courseRatings.courseCode, courses.code))
      .where(eq(courseRatings.userId, userId)),
    db
      .select({ ratingId: achievementEvidence.ratingId })
      .from(achievementEvidence)
      .innerJoin(
        userAchievements,
        eq(achievementEvidence.achievementId, userAchievements.id),
      )
      .where(eq(userAchievements.userId, userId)),
    db
      .select({
        achievementId: userAchievements.id,
        ruleId: userAchievements.ruleId,
        status: userAchievements.status,
        ruleKey: achievementRules.ruleKey,
        version: achievementRules.version,
        displayName: achievementRules.displayName,
        description: achievementRules.description,
        badgeCode: achievementRules.badgeCode,
        tier: achievementRules.tier,
        requiredCount: achievementRules.requiredCount,
      })
      .from(userAchievements)
      .innerJoin(
        achievementRules,
        eq(userAchievements.ruleId, achievementRules.id),
      )
      .where(eq(userAchievements.userId, userId)),
  ]);
  return { rules, ratings, occupiedRows, ownedRows };
}

export async function getMyProfessionalAchievementProgress(): Promise<
  ProfessionalAchievementProgress[]
> {
  const user = await requireAuth();
  const { rules, ratings, occupiedRows, ownedRows } =
    await loadUserAchievementInputs(user.id);
  const occupied = new Set(occupiedRows.map((row) => row.ratingId));
  const activeOwned = ownedRows.filter((row) => row.status === "active");
  const activeKeys = new Set(activeOwned.map((row) => row.ruleKey));
  const activeTiers = new Set(activeOwned.map((row) => row.tier));

  const progress = rules.flatMap((rule) => {
    const owned = activeOwned.find((row) => row.ruleKey === rule.ruleKey);
    if (owned) {
      return [
        {
          ruleId: owned.ruleId,
          displayName: owned.displayName,
          description: owned.description,
          badgeCode: owned.badgeCode,
          tier: owned.tier as ProfessionalAchievementProgress["tier"],
          matchedCount: owned.requiredCount,
          requiredCount: owned.requiredCount,
          eligible: false,
          redeemed: true,
          prerequisiteSatisfied: true,
          slotAvailable: true,
        },
      ];
    }
    const evaluation = evaluateSubjectCountRule(
      {
        subjectGroups:
          rule.subjectGroups.length > 0
            ? rule.subjectGroups
            : [
                {
                  subjectCodes: rule.subjectCodes,
                  requiredCount: rule.requiredCount,
                },
              ],
      },
      ratings,
      occupied,
    );
    const prerequisiteSatisfied =
      !rule.prerequisiteRuleKey || activeKeys.has(rule.prerequisiteRuleKey);
    const slotAvailable = rule.tier === "bronze" || !activeTiers.has(rule.tier);
    return [
      {
        ruleId: rule.id,
        displayName: rule.displayName,
        description: rule.description,
        badgeCode: rule.badgeCode,
        tier: rule.tier as ProfessionalAchievementProgress["tier"],
        matchedCount: evaluation.matchedCount,
        requiredCount: evaluation.requiredCount,
        eligible: evaluation.eligible && prerequisiteSatisfied && slotAvailable,
        redeemed: false,
        prerequisiteSatisfied,
        slotAvailable,
      },
    ];
  });

  const enabledKeys = new Set(rules.map((rule) => rule.ruleKey));
  for (const owned of activeOwned) {
    if (enabledKeys.has(owned.ruleKey)) continue;
    progress.push({
      ruleId: owned.ruleId,
      displayName: owned.displayName,
      description: owned.description,
      badgeCode: owned.badgeCode,
      tier: owned.tier as ProfessionalAchievementProgress["tier"],
      matchedCount: owned.requiredCount,
      requiredCount: owned.requiredCount,
      eligible: false,
      redeemed: true,
      prerequisiteSatisfied: true,
      slotAvailable: true,
    });
  }
  return progress;
}

export async function redeemProfessionalAchievement(ruleId: string) {
  const user = await requireAuth();
  if (!/^[0-9a-f-]{36}$/i.test(ruleId)) throw new Error("称号规则无效");
  await ensureAchievementProfile(user.id);

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
      const [rule] = await tx
        .select({
          id: achievementRules.id,
          ruleKey: achievementRules.ruleKey,
          tier: achievementRules.tier,
          subjectCodes: achievementRules.subjectCodes,
          subjectGroups: achievementRules.subjectGroups,
          requiredCount: achievementRules.requiredCount,
          prerequisiteRuleKey: achievementRules.prerequisiteRuleKey,
        })
        .from(achievementRules)
        .where(
          and(
            eq(achievementRules.id, ruleId),
            eq(achievementRules.category, "professional"),
            eq(achievementRules.enabled, true),
          ),
        )
        .limit(1);
      if (!rule) throw new Error("称号规则不存在或未启用");

      const [existing] = await tx
        .select({
          id: userAchievements.id,
          status: userAchievements.status,
        })
        .from(userAchievements)
        .innerJoin(
          achievementRules,
          eq(userAchievements.ruleId, achievementRules.id),
        )
        .where(
          and(
            eq(userAchievements.userId, user.id),
            eq(achievementRules.ruleKey, rule.ruleKey),
          ),
        )
        .limit(1);
      if (existing && existing.status !== "revoked") {
        throw new Error("称号已经点亮");
      }

      let prerequisiteAchievementId: string | null = null;
      if (rule.prerequisiteRuleKey) {
        const [prerequisite] = await tx
          .select({ id: userAchievements.id })
          .from(userAchievements)
          .innerJoin(
            achievementRules,
            eq(userAchievements.ruleId, achievementRules.id),
          )
          .where(
            and(
              eq(userAchievements.userId, user.id),
              eq(userAchievements.status, "active"),
              eq(achievementRules.ruleKey, rule.prerequisiteRuleKey),
            ),
          )
          .limit(1);
        if (!prerequisite) throw new Error("需要先点亮前置称号");
        prerequisiteAchievementId = prerequisite.id;
      }

      if (rule.tier !== "bronze") {
        const occupiedSlot = await tx
          .select({ id: userAchievements.id })
          .from(userAchievements)
          .where(
            and(
              eq(userAchievements.userId, user.id),
              eq(userAchievements.status, "active"),
              eq(userAchievements.tier, rule.tier),
            ),
          )
          .limit(1);
        if (occupiedSlot.length)
          throw new Error(
            `只能同时拥有一个${rule.tier === "silver" ? "银标" : "金标"}`,
          );
      }

      const ratings = await tx
        .select({
          id: courseRatings.id,
          courseCode: courseRatings.courseCode,
          subject: courses.subject,
        })
        .from(courseRatings)
        .innerJoin(courses, eq(courseRatings.courseCode, courses.code))
        .where(eq(courseRatings.userId, user.id));
      const occupiedRows = await tx
        .select({ ratingId: achievementEvidence.ratingId })
        .from(achievementEvidence)
        .innerJoin(
          userAchievements,
          eq(achievementEvidence.achievementId, userAchievements.id),
        )
        .where(and(eq(userAchievements.userId, user.id)));
      const evaluation = evaluateSubjectCountRule(
        {
          subjectGroups:
            rule.subjectGroups.length > 0
              ? rule.subjectGroups
              : [
                  {
                    subjectCodes: rule.subjectCodes,
                    requiredCount: rule.requiredCount,
                  },
                ],
        },
        ratings,
        new Set(occupiedRows.map((row) => row.ratingId)),
      );
      if (!evaluation.eligible) throw new Error("尚未满足点亮条件");

      const [achievement] = existing
        ? await tx
            .update(userAchievements)
            .set({
              ruleId,
              tier: rule.tier,
              status: "active",
              revokedAt: null,
            })
            .where(eq(userAchievements.id, existing.id))
            .returning({ id: userAchievements.id })
        : await tx
            .insert(userAchievements)
            .values({ userId: user.id, ruleId, tier: rule.tier })
            .returning({ id: userAchievements.id });
      const selected = new Set(evaluation.evidenceRatingIds);
      const evidence = (ratings as AchievementRating[])
        .filter((rating) => selected.has(rating.id))
        .map((rating) => ({
          achievementId: achievement.id,
          ratingId: rating.id,
          courseCode: rating.courseCode,
        }));
      await tx.insert(achievementEvidence).values(evidence);
      if (prerequisiteAchievementId) {
        await tx
          .update(userAchievements)
          .set({ status: "superseded" })
          .where(eq(userAchievements.id, prerequisiteAchievementId));
        await tx
          .update(achievementProfiles)
          .set({
            primaryAchievementId: achievement.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(achievementProfiles.userId, user.id),
              eq(
                achievementProfiles.primaryAchievementId,
                prerequisiteAchievementId,
              ),
            ),
          );
      }
      return { id: achievement.id };
    });

    revalidatePath("/courses/achievements");
    return result;
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new Error("称号兑换发生冲突，请刷新后重试");
    }
    throw error;
  }
}

export async function revokeProfessionalAchievement(achievementId: string) {
  const user = await requireAuth();
  if (!/^[0-9a-f-]{36}$/i.test(achievementId)) throw new Error("称号无效");

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
    const rows = await tx
      .select({
        id: userAchievements.id,
        status: userAchievements.status,
        ruleKey: achievementRules.ruleKey,
        prerequisiteRuleKey: achievementRules.prerequisiteRuleKey,
      })
      .from(userAchievements)
      .innerJoin(
        achievementRules,
        eq(userAchievements.ruleId, achievementRules.id),
      )
      .where(eq(userAchievements.userId, user.id));
    const active = rows.find(
      (row) => row.id === achievementId && row.status === "active",
    );
    if (!active) throw new Error("称号不存在或已撤销");

    const byKey = new Map(rows.map((row) => [row.ruleKey, row]));
    const chainIds: string[] = [];
    let cursor: typeof active | undefined = active;
    while (cursor) {
      chainIds.push(cursor.id);
      cursor = cursor.prerequisiteRuleKey
        ? byKey.get(cursor.prerequisiteRuleKey)
        : undefined;
    }
    await tx
      .delete(achievementEvidence)
      .where(inArray(achievementEvidence.achievementId, chainIds));
    const now = new Date();
    await tx
      .update(userAchievements)
      .set({ status: "revoked", revokedAt: now })
      .where(inArray(userAchievements.id, chainIds));
    await tx
      .update(achievementProfiles)
      .set({ primaryAchievementId: null, updatedAt: now })
      .where(
        and(
          eq(achievementProfiles.userId, user.id),
          eq(achievementProfiles.primaryAchievementId, achievementId),
        ),
      );
  });

  revalidatePath("/courses/achievements");
}
