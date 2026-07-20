"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  achievementFusionRecipes,
  achievementNotices,
  achievementRules,
  userAchievements,
  userHiddenAchievements,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { getHiddenAchievementGroupsForUser } from "@/lib/hidden-achievement";

export type { HiddenAchievementGroup } from "@/lib/hidden-achievement";

export async function getMyHiddenAchievementGroups() {
  const user = await requireAuth();
  return getHiddenAchievementGroupsForUser(user.id);
}

export async function equipHiddenAchievement(
  sourceRuleKey: string,
  recipeId: string,
) {
  const user = await requireAuth();

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${user.id}:hidden-achievement`}))`,
    );

    const [recipe] = await tx
      .select({ sourceRuleKeys: achievementFusionRecipes.sourceRuleKeys })
      .from(achievementFusionRecipes)
      .where(
        and(
          eq(achievementFusionRecipes.id, recipeId),
          eq(achievementFusionRecipes.enabled, true),
          eq(achievementFusionRecipes.kind, "same_profession_gold"),
        ),
      )
      .limit(1);
    if (
      !recipe ||
      recipe.sourceRuleKeys.length !== 1 ||
      recipe.sourceRuleKeys[0] !== sourceRuleKey
    ) {
      throw new Error("这个称号目前不可用");
    }

    const [source] = await tx
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
          eq(userAchievements.tier, "gold"),
          eq(achievementRules.ruleKey, sourceRuleKey),
        ),
      )
      .limit(1);
    if (!source) throw new Error("前置成就尚未满足");

    await tx
      .update(userHiddenAchievements)
      .set({ equipped: false, updatedAt: new Date() })
      .where(eq(userHiddenAchievements.userId, user.id));
    await tx
      .insert(userHiddenAchievements)
      .values({
        userId: user.id,
        sourceRuleKey,
        selectedRecipeId: recipeId,
        equipped: true,
      })
      .onConflictDoUpdate({
        target: [
          userHiddenAchievements.userId,
          userHiddenAchievements.sourceRuleKey,
        ],
        set: {
          selectedRecipeId: recipeId,
          equipped: true,
          updatedAt: new Date(),
        },
      });
    await tx
      .update(achievementNotices)
      .set({ invalidatedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(achievementNotices.userId, user.id),
          eq(
            achievementNotices.opportunityKey,
            `hidden:${sourceRuleKey}:legend`,
          ),
        ),
      );
  });

  revalidatePath("/courses/achievements");
  revalidatePath("/courses");
}
