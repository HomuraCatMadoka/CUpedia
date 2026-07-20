import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  achievementFusionRecipes,
  achievementProfiles,
  achievementRules,
  userAchievements,
  userHiddenAchievements,
  users,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { resolveAvatarUrl, type EquippedPersonTitle } from "@/lib/user-avatar";

export type PublicAchievementSummary = {
  id: string;
  displayName: string;
  badgeCode: string;
  tier: "bronze" | "silver" | "gold";
  category: string;
  publicDescription: string;
  primary: boolean;
};

export type AuthorAchievementSummary = {
  showcaseId: string | null;
  avatarUrl: string;
  equippedTitle: EquippedPersonTitle | null;
  achievements: PublicAchievementSummary[];
};

function toTier(value: string): PublicAchievementSummary["tier"] {
  return value === "silver" || value === "gold" ? value : "bronze";
}

export async function ensureAchievementProfile(userId: string) {
  await db
    .insert(achievementProfiles)
    .values({ userId })
    .onConflictDoNothing({ target: achievementProfiles.userId });
}

export async function getAchievementSummariesForAuthors(
  userIds: string[],
): Promise<Map<string, AuthorAchievementSummary>> {
  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) return new Map();

  await db
    .insert(achievementProfiles)
    .values(uniqueUserIds.map((userId) => ({ userId })))
    .onConflictDoNothing({ target: achievementProfiles.userId });

  const identities = await db
    .select({
      userId: users.id,
      image: users.image,
      showcaseId: achievementProfiles.showcaseId,
    })
    .from(users)
    .leftJoin(achievementProfiles, eq(users.id, achievementProfiles.userId))
    .where(inArray(users.id, uniqueUserIds));

  const rows = await db
    .select({
      userId: userAchievements.userId,
      showcaseId: achievementProfiles.showcaseId,
      primaryAchievementId: achievementProfiles.primaryAchievementId,
      achievementId: userAchievements.id,
      ruleKey: achievementRules.ruleKey,
      displayName: achievementRules.displayName,
      badgeCode: achievementRules.badgeCode,
      tier: achievementRules.tier,
      category: achievementRules.category,
      description: achievementRules.description,
    })
    .from(userAchievements)
    .innerJoin(
      achievementRules,
      eq(userAchievements.ruleId, achievementRules.id),
    )
    .leftJoin(
      achievementProfiles,
      eq(userAchievements.userId, achievementProfiles.userId),
    )
    .where(
      and(
        inArray(userAchievements.userId, uniqueUserIds),
        eq(userAchievements.status, "active"),
      ),
    );

  const result = new Map<string, AuthorAchievementSummary>(
    identities.map((identity) => [
      identity.userId,
      {
        showcaseId: identity.showcaseId,
        avatarUrl: resolveAvatarUrl(identity.image),
        equippedTitle: null,
        achievements: [],
      },
    ]),
  );
  const activeRules = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const summary = result.get(row.userId) ?? {
      showcaseId: row.showcaseId,
      avatarUrl: resolveAvatarUrl(null),
      equippedTitle: null,
      achievements: [],
    };
    const rules = activeRules.get(row.userId) ?? new Map<string, string>();
    rules.set(row.ruleKey, row.badgeCode);
    activeRules.set(row.userId, rules);
    summary.achievements.push({
      id: row.achievementId,
      displayName: row.displayName,
      badgeCode: row.badgeCode,
      tier: toTier(row.tier),
      category: row.category,
      publicDescription: row.category === "professional" ? row.description : "",
      primary: row.primaryAchievementId === row.achievementId,
    });
    result.set(row.userId, summary);
  }

  const titles = await db
    .select({
      userId: userHiddenAchievements.userId,
      sourceRuleKey: userHiddenAchievements.sourceRuleKey,
      displayName: achievementRules.displayName,
    })
    .from(userHiddenAchievements)
    .innerJoin(
      achievementFusionRecipes,
      eq(userHiddenAchievements.selectedRecipeId, achievementFusionRecipes.id),
    )
    .innerJoin(
      achievementRules,
      eq(achievementFusionRecipes.targetRuleId, achievementRules.id),
    )
    .where(
      and(
        inArray(userHiddenAchievements.userId, uniqueUserIds),
        eq(userHiddenAchievements.equipped, true),
        eq(achievementFusionRecipes.enabled, true),
      ),
    );
  for (const title of titles) {
    const sourceBadgeCode = activeRules
      .get(title.userId)
      ?.get(title.sourceRuleKey);
    if (!sourceBadgeCode) continue;
    const summary = result.get(title.userId);
    if (summary) {
      summary.equippedTitle = {
        displayName: title.displayName,
        badgeCode: sourceBadgeCode,
      };
    }
  }
  return result;
}

export async function getMyAchievementProfile() {
  const user = await requireAuth();
  await ensureAchievementProfile(user.id);
  const summaries = await getAchievementSummariesForAuthors([user.id]);
  const [profile] = await db
    .select({ showcaseId: achievementProfiles.showcaseId })
    .from(achievementProfiles)
    .where(eq(achievementProfiles.userId, user.id))
    .limit(1);
  return {
    showcaseId: profile.showcaseId,
    avatarUrl:
      summaries.get(user.id)?.avatarUrl ?? resolveAvatarUrl(user.image),
    equippedTitle: summaries.get(user.id)?.equippedTitle ?? null,
    achievements: summaries.get(user.id)?.achievements ?? [],
  };
}

export async function getPublicAchievementShowcase(showcaseId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(showcaseId)) return null;
  const [profile] = await db
    .select({
      userId: achievementProfiles.userId,
      showcaseId: achievementProfiles.showcaseId,
      nickname: users.nickname,
      image: users.image,
    })
    .from(achievementProfiles)
    .innerJoin(users, eq(achievementProfiles.userId, users.id))
    .where(eq(achievementProfiles.showcaseId, showcaseId))
    .limit(1);
  if (!profile) return null;

  const summaries = await getAchievementSummariesForAuthors([profile.userId]);
  return {
    showcaseId: profile.showcaseId,
    nickname: profile.nickname,
    avatarUrl:
      summaries.get(profile.userId)?.avatarUrl ??
      resolveAvatarUrl(profile.image),
    equippedTitle: summaries.get(profile.userId)?.equippedTitle ?? null,
    achievements: summaries.get(profile.userId)?.achievements ?? [],
  };
}
