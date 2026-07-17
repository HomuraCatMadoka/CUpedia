"use server";

import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { achievementNotices } from "@/db/schema";
import { getProfessionalAchievementProgressForUser } from "@/lib/achievement-actions";
import { getPersonTitleProgressForUser } from "@/lib/achievement-fusion-actions";
import { getOptionalUser, requireAuth } from "@/lib/auth-guard";

export type AchievementNoticeToast = {
  opportunityKey: string;
  displayName: string;
};

type CurrentOpportunity = AchievementNoticeToast & {
  kind: "professional" | "fusion";
  targetId: string;
  targetTier: "bronze" | "silver" | "gold";
};

async function getCurrentOpportunities(
  userId: string,
): Promise<CurrentOpportunity[]> {
  const [professional, fusion] = await Promise.all([
    getProfessionalAchievementProgressForUser(userId),
    getPersonTitleProgressForUser(userId),
  ]);
  return [
    ...professional
      .filter((item) => item.eligible && !item.redeemed)
      .map((item) => ({
        opportunityKey: `professional:${item.ruleId}:${item.tier}`,
        kind: "professional" as const,
        targetId: item.ruleId,
        targetTier: item.tier,
        displayName: item.displayName,
      })),
    ...fusion
      .filter((item) => item.eligible && !item.redeemed)
      .map((item) => ({
        opportunityKey: `fusion:${item.recipeId}:gold`,
        kind: "fusion" as const,
        targetId: item.recipeId,
        targetTier: "gold" as const,
        displayName: item.displayName,
      })),
  ];
}

export async function syncAchievementNoticesForUser(
  userId: string,
): Promise<AchievementNoticeToast[]> {
  const actor = await requireAuth();
  if (actor.id !== userId && actor.role !== "admin") {
    throw new Error("无权更新他人的成就提醒");
  }
  const opportunities = await getCurrentOpportunities(userId);
  const now = new Date();
  const inserted = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const existing = await tx
      .select({
        opportunityKey: achievementNotices.opportunityKey,
        invalidatedAt: achievementNotices.invalidatedAt,
      })
      .from(achievementNotices)
      .where(eq(achievementNotices.userId, userId));
    const existingKeys = new Set(existing.map((item) => item.opportunityKey));
    const currentKeys = opportunities.map((item) => item.opportunityKey);

    if (currentKeys.length) {
      await tx
        .update(achievementNotices)
        .set({ invalidatedAt: null, updatedAt: now })
        .where(
          and(
            eq(achievementNotices.userId, userId),
            inArray(achievementNotices.opportunityKey, currentKeys),
          ),
        );
    }
    await tx
      .update(achievementNotices)
      .set({ invalidatedAt: now, updatedAt: now })
      .where(
        and(
          eq(achievementNotices.userId, userId),
          isNull(achievementNotices.invalidatedAt),
          currentKeys.length
            ? notInArray(achievementNotices.opportunityKey, currentKeys)
            : sql`true`,
        ),
      );

    const fresh = opportunities.filter(
      (item) => !existingKeys.has(item.opportunityKey),
    );
    if (!fresh.length) return [];
    return tx
      .insert(achievementNotices)
      .values(
        fresh.map((item) => ({
          userId,
          ...item,
        })),
      )
      .onConflictDoNothing({
        target: [achievementNotices.userId, achievementNotices.opportunityKey],
      })
      .returning({
        opportunityKey: achievementNotices.opportunityKey,
        displayName: achievementNotices.displayName,
      });
  });
  return inserted;
}

export async function getAchievementNoticeCount(): Promise<number> {
  const user = await getOptionalUser();
  if (!user) return 0;
  const rows = await db
    .select({ id: achievementNotices.id })
    .from(achievementNotices)
    .where(
      and(
        eq(achievementNotices.userId, user.id),
        isNull(achievementNotices.invalidatedAt),
        isNull(achievementNotices.seenAt),
      ),
    );
  return rows.length;
}

export async function getMyAchievementNoticeState() {
  const user = await requireAuth();
  const rows = await db
    .select({
      opportunityKey: achievementNotices.opportunityKey,
      kind: achievementNotices.kind,
      targetId: achievementNotices.targetId,
      displayName: achievementNotices.displayName,
      seenAt: achievementNotices.seenAt,
    })
    .from(achievementNotices)
    .where(
      and(
        eq(achievementNotices.userId, user.id),
        isNull(achievementNotices.invalidatedAt),
      ),
    )
    .orderBy(asc(achievementNotices.seenAt), asc(achievementNotices.createdAt));
  return {
    notices: rows,
    unseenCount: rows.filter((row) => row.seenAt === null).length,
  };
}

export async function markAchievementNoticesSeen() {
  const user = await requireAuth();
  await db
    .update(achievementNotices)
    .set({ seenAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(achievementNotices.userId, user.id),
        isNull(achievementNotices.invalidatedAt),
        isNull(achievementNotices.seenAt),
      ),
    );
  revalidatePath("/courses");
}
