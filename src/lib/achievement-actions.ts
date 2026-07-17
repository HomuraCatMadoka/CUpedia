"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  achievementEvidence,
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

export type ProfessionalAchievementRuleInput = {
  ruleKey: string;
  version: number;
  displayName: string;
  description?: string;
  badgeCode: string;
  subjectCodes: string[];
  requiredCount: number;
  enabled?: boolean;
};

export type ProfessionalAchievementProgress = {
  ruleId: string;
  displayName: string;
  description: string;
  badgeCode: string;
  matchedCount: number;
  requiredCount: number;
  eligible: boolean;
  redeemed: boolean;
};

function normalizeRuleInput(input: ProfessionalAchievementRuleInput) {
  const ruleKey = input.ruleKey.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const description = input.description?.trim() ?? "";
  const subjectCodes = [
    ...new Set(input.subjectCodes.map((code) => code.trim())),
  ];

  if (!/^[a-z0-9-]{2,64}$/.test(ruleKey)) throw new Error("规则标识格式无效");
  if (!displayName || displayName.length > 80)
    throw new Error("称号名称格式无效");
  if (description.length > 240) throw new Error("称号说明最多 240 字");
  if (!/^[A-Z]{4}$/.test(input.badgeCode))
    throw new Error("专业代码须为四位大写字母");
  if (
    subjectCodes.length === 0 ||
    subjectCodes.some((code) => !/^[A-Z]{2,6}$/.test(code))
  ) {
    throw new Error("学科代码须为 2 至 6 位大写字母");
  }
  if (!Number.isInteger(input.version) || input.version < 1)
    throw new Error("规则版本无效");
  if (
    !Number.isInteger(input.requiredCount) ||
    input.requiredCount < 1 ||
    input.requiredCount > 20
  ) {
    throw new Error("课程门数须为 1 至 20");
  }

  return {
    ruleKey,
    displayName,
    description,
    badgeCode: input.badgeCode,
    subjectCodes,
    version: input.version,
    requiredCount: input.requiredCount,
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
        tier: "bronze",
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
      subjectCodes: achievementRules.subjectCodes,
      requiredCount: achievementRules.requiredCount,
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
        displayName: achievementRules.displayName,
        description: achievementRules.description,
        badgeCode: achievementRules.badgeCode,
        subjectCodes: achievementRules.subjectCodes,
        requiredCount: achievementRules.requiredCount,
      })
      .from(achievementRules)
      .where(
        and(
          eq(achievementRules.category, "professional"),
          eq(achievementRules.tier, "bronze"),
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
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.status, "active"),
        ),
      ),
    db
      .select({ ruleId: userAchievements.ruleId })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.status, "active"),
        ),
      ),
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
  const owned = new Set(ownedRows.map((row) => row.ruleId));

  return rules.map((rule) => {
    const evaluation = evaluateSubjectCountRule(rule, ratings, occupied);
    return {
      ruleId: rule.id,
      displayName: rule.displayName,
      description: rule.description,
      badgeCode: rule.badgeCode,
      matchedCount: evaluation.matchedCount,
      requiredCount: evaluation.requiredCount,
      eligible: evaluation.eligible,
      redeemed: owned.has(rule.id),
    };
  });
}

export async function redeemProfessionalAchievement(ruleId: string) {
  const user = await requireAuth();
  if (!/^[0-9a-f-]{36}$/i.test(ruleId)) throw new Error("称号规则无效");

  const result = await db.transaction(async (tx) => {
    const [rule] = await tx
      .select({
        id: achievementRules.id,
        subjectCodes: achievementRules.subjectCodes,
        requiredCount: achievementRules.requiredCount,
      })
      .from(achievementRules)
      .where(
        and(
          eq(achievementRules.id, ruleId),
          eq(achievementRules.category, "professional"),
          eq(achievementRules.tier, "bronze"),
          eq(achievementRules.enabled, true),
        ),
      )
      .limit(1);
    if (!rule) throw new Error("称号规则不存在或未启用");

    const existing = await tx
      .select({ id: userAchievements.id })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, user.id),
          eq(userAchievements.ruleId, ruleId),
          eq(userAchievements.status, "active"),
        ),
      )
      .limit(1);
    if (existing.length) throw new Error("称号已经点亮");

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
      .where(
        and(
          eq(userAchievements.userId, user.id),
          eq(userAchievements.status, "active"),
        ),
      );
    const evaluation = evaluateSubjectCountRule(
      rule,
      ratings,
      new Set(occupiedRows.map((row) => row.ratingId)),
    );
    if (!evaluation.eligible) throw new Error("尚未满足点亮条件");

    const [achievement] = await tx
      .insert(userAchievements)
      .values({ userId: user.id, ruleId })
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
    return { id: achievement.id };
  });

  revalidatePath("/courses/achievements");
  return result;
}
