import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  achievementFusionRecipes,
  achievementRules,
  userAchievements,
  userHiddenAchievements,
} from "@/db/schema";

export type HiddenAchievementGroup = {
  sourceRuleKey: string;
  badgeCode: string;
  displayName: string;
  claimable: boolean;
  equipped: boolean;
  selectedRecipeId: string | null;
  options: Array<{ recipeId: string; displayName: string }>;
};

export async function getHiddenAchievementGroupsForUser(
  userId: string,
): Promise<HiddenAchievementGroup[]> {
  const recipes = await db
    .select({
      recipeId: achievementFusionRecipes.id,
      sourceRuleKeys: achievementFusionRecipes.sourceRuleKeys,
      displayName: achievementRules.displayName,
    })
    .from(achievementFusionRecipes)
    .innerJoin(
      achievementRules,
      eq(achievementFusionRecipes.targetRuleId, achievementRules.id),
    )
    .where(
      and(
        eq(achievementFusionRecipes.enabled, true),
        eq(achievementFusionRecipes.kind, "same_profession_gold"),
      ),
    );

  const sourceRuleKeys = [
    ...new Set(
      recipes.flatMap((recipe) =>
        recipe.sourceRuleKeys.length === 1 ? recipe.sourceRuleKeys : [],
      ),
    ),
  ];
  if (sourceRuleKeys.length === 0) return [];

  const [ownedSources, claimed] = await Promise.all([
    db
      .select({
        ruleKey: achievementRules.ruleKey,
        badgeCode: achievementRules.badgeCode,
      })
      .from(userAchievements)
      .innerJoin(
        achievementRules,
        eq(userAchievements.ruleId, achievementRules.id),
      )
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.status, "active"),
          eq(userAchievements.tier, "gold"),
          inArray(achievementRules.ruleKey, sourceRuleKeys),
        ),
      ),
    db
      .select({
        sourceRuleKey: userHiddenAchievements.sourceRuleKey,
        selectedRecipeId: userHiddenAchievements.selectedRecipeId,
        equipped: userHiddenAchievements.equipped,
      })
      .from(userHiddenAchievements)
      .where(eq(userHiddenAchievements.userId, userId)),
  ]);

  const claimedBySource = new Map(
    claimed.map((item) => [item.sourceRuleKey, item]),
  );

  return ownedSources
    .map((source) => {
      const options = recipes
        .filter(
          (recipe) =>
            recipe.sourceRuleKeys.length === 1 &&
            recipe.sourceRuleKeys[0] === source.ruleKey,
        )
        .map((recipe) => ({
          recipeId: recipe.recipeId,
          displayName: recipe.displayName,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-Hans"));
      const existing = claimedBySource.get(source.ruleKey);
      return {
        sourceRuleKey: source.ruleKey,
        badgeCode: source.badgeCode,
        displayName: `${source.badgeCode} 传说`,
        claimable: !existing,
        equipped: existing?.equipped ?? false,
        selectedRecipeId: existing?.selectedRecipeId ?? null,
        options,
      };
    })
    .filter((group) => group.options.length > 0)
    .sort((a, b) => a.badgeCode.localeCompare(b.badgeCode));
}
