"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { achievementFusionRecipes, achievementRules } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import {
  parsePersonTitleCatalogJson,
  type NormalizedPersonTitleCatalog,
} from "@/lib/person-title-catalog";

const ADMIN_PATH = "/admin/achievement-rules";

type Queryable = Pick<typeof db, "select">;

async function assertCatalogCanPublish(
  queryable: Queryable,
  catalog: NormalizedPersonTitleCatalog,
) {
  const recipeKeys = catalog.recipes.map((recipe) => recipe.recipeKey);
  const targetRuleKeys = recipeKeys.map((key) => `person-${key}`);
  const sourceRuleKeys = [
    ...new Set(catalog.recipes.flatMap((recipe) => recipe.sourceRuleKeys)),
  ];

  const [existingRecipes, existingTargets, sourceRules] = await Promise.all([
    queryable
      .select({
        recipeKey: achievementFusionRecipes.recipeKey,
        version: achievementFusionRecipes.version,
      })
      .from(achievementFusionRecipes)
      .where(inArray(achievementFusionRecipes.recipeKey, recipeKeys)),
    queryable
      .select({
        ruleKey: achievementRules.ruleKey,
        version: achievementRules.version,
      })
      .from(achievementRules)
      .where(inArray(achievementRules.ruleKey, targetRuleKeys)),
    queryable
      .select({
        ruleKey: achievementRules.ruleKey,
        tier: achievementRules.tier,
        category: achievementRules.category,
      })
      .from(achievementRules)
      .where(
        and(
          inArray(achievementRules.ruleKey, sourceRuleKeys),
          eq(achievementRules.enabled, true),
        ),
      ),
  ]);

  const conflictingRecipe = existingRecipes.find(
    (recipe) => recipe.version >= catalog.version,
  );
  const conflictingTarget = existingTargets.find(
    (rule) => rule.version >= catalog.version,
  );
  const conflict = conflictingRecipe?.recipeKey ?? conflictingTarget?.ruleKey;
  if (conflict) {
    throw new Error(`${conflict} 已有 v${catalog.version} 或更高版本`);
  }

  const sourcesByKey = new Map(sourceRules.map((rule) => [rule.ruleKey, rule]));
  for (const recipe of catalog.recipes) {
    const expectedTier = recipe.kind === "dual_bronze" ? "bronze" : "gold";
    for (const sourceRuleKey of recipe.sourceRuleKeys) {
      const source = sourcesByKey.get(sourceRuleKey);
      if (source?.category !== "professional" || source.tier !== expectedTier) {
        throw new Error(
          `${sourceRuleKey} 不是已启用的${expectedTier === "gold" ? "金标" : "铜标"}来源`,
        );
      }
    }
  }
}

export async function previewPersonTitleCatalog(rawJson: string) {
  await requireAdmin();
  const catalog = parsePersonTitleCatalogJson(rawJson);
  await assertCatalogCanPublish(db, catalog);
  return {
    version: catalog.version,
    sourceLabel: catalog.sourceLabel,
    recipeCount: catalog.recipes.length,
    sourceCount: new Set(
      catalog.recipes.flatMap((recipe) => recipe.sourceRuleKeys),
    ).size,
    enabledCount: catalog.recipes.filter((recipe) => recipe.enabled).length,
  };
}

export async function publishPersonTitleCatalog(rawJson: string) {
  const admin = await requireAdmin();
  const catalog = parsePersonTitleCatalogJson(rawJson);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(428368)`);
    await assertCatalogCanPublish(tx, catalog);

    const recipeKeys = catalog.recipes.map((recipe) => recipe.recipeKey);
    const targetRuleKeys = recipeKeys.map((key) => `person-${key}`);
    await tx
      .update(achievementFusionRecipes)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          inArray(achievementFusionRecipes.recipeKey, recipeKeys),
          ne(achievementFusionRecipes.version, catalog.version),
        ),
      );
    await tx
      .update(achievementRules)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          inArray(achievementRules.ruleKey, targetRuleKeys),
          ne(achievementRules.version, catalog.version),
        ),
      );

    const targets = await tx
      .insert(achievementRules)
      .values(
        catalog.recipes.map((recipe) => ({
          ruleKey: `person-${recipe.recipeKey}`,
          version: recipe.version,
          category: "person",
          tier: "gold",
          displayName: recipe.displayName,
          description: recipe.description,
          badgeCode: recipe.badgeCode,
          subjectCodes: [],
          subjectGroups: [],
          requiredCount: 1,
          enabled: recipe.enabled,
          createdBy: admin.id,
        })),
      )
      .returning({
        id: achievementRules.id,
        ruleKey: achievementRules.ruleKey,
      });
    const targetIds = new Map(
      targets.map((target) => [target.ruleKey, target.id]),
    );

    await tx.insert(achievementFusionRecipes).values(
      catalog.recipes.map((recipe) => {
        const targetRuleId = targetIds.get(`person-${recipe.recipeKey}`);
        if (!targetRuleId) throw new Error("人名称号目标规则创建失败");
        return {
          recipeKey: recipe.recipeKey,
          version: recipe.version,
          kind: recipe.kind,
          targetRuleId,
          sourceRuleKeys: recipe.sourceRuleKeys,
          enabled: recipe.enabled,
          createdBy: admin.id,
        };
      }),
    );

    return { version: catalog.version, recipeCount: catalog.recipes.length };
  });

  revalidatePath(ADMIN_PATH);
  revalidatePath("/courses/achievements");
  return result;
}
