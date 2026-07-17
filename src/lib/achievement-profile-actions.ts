"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { achievementProfiles, userAchievements } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { ensureAchievementProfile } from "@/lib/achievement-profile";

export async function setPrimaryAchievement(achievementId: string | null) {
  const user = await requireAuth();
  await ensureAchievementProfile(user.id);

  if (achievementId !== null) {
    if (!/^[0-9a-f-]{36}$/i.test(achievementId)) throw new Error("称号无效");
    const [owned] = await db
      .select({ id: userAchievements.id })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.id, achievementId),
          eq(userAchievements.userId, user.id),
          eq(userAchievements.status, "active"),
        ),
      )
      .limit(1);
    if (!owned) throw new Error("只能选择当前拥有的称号");
  }

  await db
    .update(achievementProfiles)
    .set({ primaryAchievementId: achievementId, updatedAt: new Date() })
    .where(eq(achievementProfiles.userId, user.id));
  revalidatePath("/courses/achievements");
}
