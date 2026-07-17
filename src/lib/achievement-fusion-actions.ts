"use server";

import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  achievementFusionRecipes,
  achievementFusionSources,
  achievementProfiles,
  achievementRules,
  userAchievements,
} from "@/db/schema";
import { requireAdmin, requireAuth } from "@/lib/auth-guard";
import { ensureAchievementProfile } from "@/lib/achievement-profile";

export type PersonTitleRecipeInput = {
  recipeKey: string;
  version: number;
  kind: "dual_bronze" | "same_profession_gold";
  displayName: string;
  description?: string;
  badgeCode: string;
  sourceRuleKeys: string[];
  enabled?: boolean;
};

export type PersonTitleProgress = {
  recipeId: string;
  displayName: string;
  description: string;
  badgeCode: string;
  eligible: boolean;
  redeemed: boolean;
  slotAvailable: boolean;
};

function normalizeRecipe(input: PersonTitleRecipeInput) {
  const recipeKey = input.recipeKey.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const description = input.description?.trim() ?? "";
  const sourceRuleKeys = input.sourceRuleKeys.map((key) =>
    key.trim().toLowerCase(),
  );
  const expectedSources = input.kind === "dual_bronze" ? 2 : 1;
  if (!/^[a-z0-9-]{2,64}$/.test(recipeKey)) throw new Error("配方标识无效");
  if (!Number.isInteger(input.version) || input.version < 1)
    throw new Error("配方版本无效");
  if (!displayName || displayName.length > 80) throw new Error("称号名称无效");
  if (description.length > 240) throw new Error("称号说明最多 240 字");
  if (!/^[A-Z]{4}$/.test(input.badgeCode))
    throw new Error("称号代码须为四位大写字母");
  if (
    sourceRuleKeys.length !== expectedSources ||
    new Set(sourceRuleKeys).size !== expectedSources ||
    sourceRuleKeys.some((key) => !/^[a-z0-9-]{2,64}$/.test(key))
  ) {
    throw new Error(
      input.kind === "dual_bronze"
        ? "双铜标配方须指定两个不同来源"
        : "同专业转换须指定一个金标来源",
    );
  }
  return {
    recipeKey,
    targetRuleKey: `person-${recipeKey}`,
    version: input.version,
    kind: input.kind,
    displayName,
    description,
    badgeCode: input.badgeCode,
    sourceRuleKeys,
    enabled: input.enabled ?? false,
  };
}

export async function createPersonTitleRecipe(input: PersonTitleRecipeInput) {
  const admin = await requireAdmin();
  const values = normalizeRecipe(input);

  const result = await db.transaction(async (tx) => {
    const sourceRules = await tx
      .select({
        ruleKey: achievementRules.ruleKey,
        tier: achievementRules.tier,
      })
      .from(achievementRules)
      .where(
        and(
          inArray(achievementRules.ruleKey, values.sourceRuleKeys),
          eq(achievementRules.category, "professional"),
          eq(achievementRules.enabled, true),
        ),
      );
    const expectedTier = values.kind === "dual_bronze" ? "bronze" : "gold";
    if (
      sourceRules.length !== values.sourceRuleKeys.length ||
      sourceRules.some((rule) => rule.tier !== expectedTier)
    ) {
      throw new Error(
        `来源规则须为已启用的${expectedTier === "bronze" ? "铜标" : "金标"}`,
      );
    }
    if (values.enabled) {
      await tx
        .update(achievementFusionRecipes)
        .set({ enabled: false, updatedAt: new Date() })
        .where(
          and(
            eq(achievementFusionRecipes.recipeKey, values.recipeKey),
            ne(achievementFusionRecipes.version, values.version),
          ),
        );
      await tx
        .update(achievementRules)
        .set({ enabled: false, updatedAt: new Date() })
        .where(
          and(
            eq(achievementRules.ruleKey, values.targetRuleKey),
            ne(achievementRules.version, values.version),
          ),
        );
    }
    const [targetRule] = await tx
      .insert(achievementRules)
      .values({
        ruleKey: values.targetRuleKey,
        version: values.version,
        category: "person",
        tier: "gold",
        displayName: values.displayName,
        description: values.description,
        badgeCode: values.badgeCode,
        subjectCodes: [],
        subjectGroups: [],
        requiredCount: 1,
        enabled: values.enabled,
        createdBy: admin.id,
      })
      .returning({ id: achievementRules.id });
    const [recipe] = await tx
      .insert(achievementFusionRecipes)
      .values({
        recipeKey: values.recipeKey,
        version: values.version,
        kind: values.kind,
        targetRuleId: targetRule.id,
        sourceRuleKeys: values.sourceRuleKeys,
        enabled: values.enabled,
        createdBy: admin.id,
      })
      .returning({ id: achievementFusionRecipes.id });
    return recipe;
  });
  revalidatePath("/admin/achievement-rules");
  revalidatePath("/courses/achievements");
  return result;
}

export async function getPersonTitleRecipes() {
  await requireAdmin();
  return db
    .select({
      id: achievementFusionRecipes.id,
      recipeKey: achievementFusionRecipes.recipeKey,
      version: achievementFusionRecipes.version,
      kind: achievementFusionRecipes.kind,
      sourceRuleKeys: achievementFusionRecipes.sourceRuleKeys,
      enabled: achievementFusionRecipes.enabled,
      displayName: achievementRules.displayName,
      badgeCode: achievementRules.badgeCode,
    })
    .from(achievementFusionRecipes)
    .innerJoin(
      achievementRules,
      eq(achievementFusionRecipes.targetRuleId, achievementRules.id),
    )
    .orderBy(
      achievementFusionRecipes.recipeKey,
      achievementFusionRecipes.version,
    );
}

async function loadFusionInputs(userId: string) {
  const [recipes, owned] = await Promise.all([
    db
      .select({
        id: achievementFusionRecipes.id,
        kind: achievementFusionRecipes.kind,
        sourceRuleKeys: achievementFusionRecipes.sourceRuleKeys,
        targetRuleId: achievementFusionRecipes.targetRuleId,
        displayName: achievementRules.displayName,
        description: achievementRules.description,
        badgeCode: achievementRules.badgeCode,
        targetRuleKey: achievementRules.ruleKey,
      })
      .from(achievementFusionRecipes)
      .innerJoin(
        achievementRules,
        eq(achievementFusionRecipes.targetRuleId, achievementRules.id),
      )
      .where(eq(achievementFusionRecipes.enabled, true)),
    db
      .select({
        id: userAchievements.id,
        status: userAchievements.status,
        tier: userAchievements.tier,
        ruleKey: achievementRules.ruleKey,
        category: achievementRules.category,
      })
      .from(userAchievements)
      .innerJoin(
        achievementRules,
        eq(userAchievements.ruleId, achievementRules.id),
      )
      .where(eq(userAchievements.userId, userId)),
  ]);
  return { recipes, owned };
}

export async function getMyPersonTitleProgress(): Promise<
  PersonTitleProgress[]
> {
  const user = await requireAuth();
  const { recipes, owned } = await loadFusionInputs(user.id);
  const active = owned.filter((item) => item.status === "active");
  const activeKeys = new Set(active.map((item) => item.ruleKey));
  const activeGold = active.some((item) => item.tier === "gold");
  return recipes.map((recipe) => {
    const target = owned.find((item) => item.ruleKey === recipe.targetRuleKey);
    const sourcesReady = recipe.sourceRuleKeys.every((key) =>
      activeKeys.has(key),
    );
    const sourceConsumesGold = recipe.kind === "same_profession_gold";
    const slotAvailable = !activeGold || (sourceConsumesGold && sourcesReady);
    return {
      recipeId: recipe.id,
      displayName: recipe.displayName,
      description: recipe.description,
      badgeCode: recipe.badgeCode,
      eligible: target?.status !== "active" && sourcesReady && slotAvailable,
      redeemed: target?.status === "active",
      slotAvailable,
    };
  });
}

export async function fusePersonTitle(recipeId: string, makePrimary: boolean) {
  const user = await requireAuth();
  if (!/^[0-9a-f-]{36}$/i.test(recipeId)) throw new Error("合成配方无效");
  await ensureAchievementProfile(user.id);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
    const [recipe] = await tx
      .select({
        id: achievementFusionRecipes.id,
        kind: achievementFusionRecipes.kind,
        sourceRuleKeys: achievementFusionRecipes.sourceRuleKeys,
        targetRuleId: achievementFusionRecipes.targetRuleId,
        targetRuleKey: achievementRules.ruleKey,
      })
      .from(achievementFusionRecipes)
      .innerJoin(
        achievementRules,
        eq(achievementFusionRecipes.targetRuleId, achievementRules.id),
      )
      .where(
        and(
          eq(achievementFusionRecipes.id, recipeId),
          eq(achievementFusionRecipes.enabled, true),
        ),
      )
      .limit(1);
    if (!recipe) throw new Error("合成配方不存在或未启用");

    const sources = await tx
      .select({ id: userAchievements.id, ruleKey: achievementRules.ruleKey })
      .from(userAchievements)
      .innerJoin(
        achievementRules,
        eq(userAchievements.ruleId, achievementRules.id),
      )
      .where(
        and(
          eq(userAchievements.userId, user.id),
          eq(userAchievements.status, "active"),
          inArray(achievementRules.ruleKey, recipe.sourceRuleKeys),
        ),
      );
    const uniqueSources = new Map<string, string>();
    for (const source of sources) {
      if (!uniqueSources.has(source.ruleKey)) {
        uniqueSources.set(source.ruleKey, source.id);
      }
    }
    if (
      uniqueSources.size !== recipe.sourceRuleKeys.length ||
      recipe.sourceRuleKeys.some((key) => !uniqueSources.has(key))
    ) {
      throw new Error("来源称号已变化，请刷新后重试");
    }
    const sourceIds = recipe.sourceRuleKeys.map(
      (key) => uniqueSources.get(key)!,
    );
    const [otherGold] = await tx
      .select({ id: userAchievements.id })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, user.id),
          eq(userAchievements.status, "active"),
          eq(userAchievements.tier, "gold"),
          notInArray(userAchievements.id, sourceIds),
        ),
      )
      .limit(1);
    if (otherGold) throw new Error("金标称号槽位已占用");

    const [historical] = await tx
      .select({ id: userAchievements.id, status: userAchievements.status })
      .from(userAchievements)
      .innerJoin(
        achievementRules,
        eq(userAchievements.ruleId, achievementRules.id),
      )
      .where(
        and(
          eq(userAchievements.userId, user.id),
          eq(achievementRules.ruleKey, recipe.targetRuleKey),
        ),
      )
      .limit(1);
    if (historical?.status === "active") throw new Error("称号已经合成");
    await tx
      .update(userAchievements)
      .set({ status: "superseded" })
      .where(inArray(userAchievements.id, sourceIds));
    const [fusion] = historical
      ? await tx
          .update(userAchievements)
          .set({
            ruleId: recipe.targetRuleId,
            tier: "gold",
            status: "active",
            revokedAt: null,
          })
          .where(eq(userAchievements.id, historical.id))
          .returning({ id: userAchievements.id })
      : await tx
          .insert(userAchievements)
          .values({
            userId: user.id,
            ruleId: recipe.targetRuleId,
            tier: "gold",
          })
          .returning({ id: userAchievements.id });
    await tx
      .delete(achievementFusionSources)
      .where(eq(achievementFusionSources.fusionAchievementId, fusion.id));
    await tx.insert(achievementFusionSources).values(
      sourceIds.map((sourceAchievementId) => ({
        fusionAchievementId: fusion.id,
        sourceAchievementId,
      })),
    );
    await tx
      .update(achievementProfiles)
      .set({
        primaryAchievementId: makePrimary ? fusion.id : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(achievementProfiles.userId, user.id),
          makePrimary
            ? sql`true`
            : inArray(achievementProfiles.primaryAchievementId, sourceIds),
        ),
      );
    return { id: fusion.id };
  });
  revalidatePath("/courses/achievements");
  return result;
}

export async function dismantlePersonTitle(achievementId: string) {
  const user = await requireAuth();
  if (!/^[0-9a-f-]{36}$/i.test(achievementId)) throw new Error("称号无效");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
    const [fusion] = await tx
      .select({ id: userAchievements.id })
      .from(userAchievements)
      .innerJoin(
        achievementRules,
        eq(userAchievements.ruleId, achievementRules.id),
      )
      .where(
        and(
          eq(userAchievements.id, achievementId),
          eq(userAchievements.userId, user.id),
          eq(userAchievements.status, "active"),
          eq(achievementRules.category, "person"),
        ),
      )
      .limit(1);
    if (!fusion) throw new Error("人名称号不存在或已拆解");
    const sources = await tx
      .select({ id: achievementFusionSources.sourceAchievementId })
      .from(achievementFusionSources)
      .where(eq(achievementFusionSources.fusionAchievementId, fusion.id));
    if (!sources.length) throw new Error("称号来源记录缺失");
    const sourceIds = sources.map((source) => source.id);
    const now = new Date();
    await tx
      .update(userAchievements)
      .set({ status: "revoked", revokedAt: now })
      .where(eq(userAchievements.id, fusion.id));
    await tx
      .update(userAchievements)
      .set({ status: "active", revokedAt: null })
      .where(inArray(userAchievements.id, sourceIds));
    await tx
      .delete(achievementFusionSources)
      .where(eq(achievementFusionSources.fusionAchievementId, fusion.id));
    await tx
      .update(achievementProfiles)
      .set({ primaryAchievementId: sourceIds[0], updatedAt: now })
      .where(
        and(
          eq(achievementProfiles.userId, user.id),
          eq(achievementProfiles.primaryAchievementId, fusion.id),
        ),
      );
  });
  revalidatePath("/courses/achievements");
}
