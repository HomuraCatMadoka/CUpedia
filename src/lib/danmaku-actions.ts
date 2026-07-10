"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { danmakuMessages, users } from "@/db/schema";
import { requireAdmin, requireAuth } from "@/lib/auth-guard";
import { checkDanmakuRateLimit } from "@/lib/danmaku-rate-limit";
import type { DanmakuMessage } from "@/lib/danmaku-types";
import { validateDanmakuContent } from "@/lib/danmaku-types";
import { currentMonthHkt } from "@/lib/hkt-datetime";

function mapRow(row: {
  id: string;
  userId: string;
  content: string;
  month: string;
  createdAt: Date;
  authorNickname: string;
}): DanmakuMessage {
  return {
    id: row.id,
    userId: row.userId,
    content: row.content,
    month: row.month,
    authorNickname: row.authorNickname,
    createdAt: row.createdAt,
  };
}

export async function listCurrentMonthDanmaku(
  now = new Date(),
): Promise<DanmakuMessage[]> {
  const month = currentMonthHkt(now);
  const rows = await db
    .select({
      id: danmakuMessages.id,
      userId: danmakuMessages.userId,
      content: danmakuMessages.content,
      month: danmakuMessages.month,
      createdAt: danmakuMessages.createdAt,
      authorNickname: users.nickname,
    })
    .from(danmakuMessages)
    .innerJoin(users, eq(danmakuMessages.userId, users.id))
    .where(eq(danmakuMessages.month, month))
    .orderBy(asc(danmakuMessages.createdAt));

  return rows.map(mapRow);
}

export async function createDanmakuAsUser(
  user: { id: string; nickname: string },
  contentInput: unknown,
): Promise<DanmakuMessage> {
  const content = validateDanmakuContent(contentInput);
  if (!checkDanmakuRateLimit(user.id)) {
    throw new Error("DANMAKU_RATE_LIMIT_EXCEEDED");
  }

  const month = currentMonthHkt();
  const [row] = await db
    .insert(danmakuMessages)
    .values({
      userId: user.id,
      content,
      month,
    })
    .returning({
      id: danmakuMessages.id,
      userId: danmakuMessages.userId,
      content: danmakuMessages.content,
      month: danmakuMessages.month,
      createdAt: danmakuMessages.createdAt,
    });

  revalidatePath("/");
  return mapRow({ ...row, authorNickname: user.nickname });
}

export async function createDanmaku(contentInput: unknown): Promise<DanmakuMessage> {
  const user = await requireAuth();
  return createDanmakuAsUser(
    { id: user.id, nickname: user.nickname },
    contentInput,
  );
}

export async function adminListCurrentMonthDanmaku(): Promise<DanmakuMessage[]> {
  await requireAdmin();
  const month = currentMonthHkt();
  const rows = await db
    .select({
      id: danmakuMessages.id,
      userId: danmakuMessages.userId,
      content: danmakuMessages.content,
      month: danmakuMessages.month,
      createdAt: danmakuMessages.createdAt,
      authorNickname: users.nickname,
    })
    .from(danmakuMessages)
    .innerJoin(users, eq(danmakuMessages.userId, users.id))
    .where(eq(danmakuMessages.month, month))
    .orderBy(desc(danmakuMessages.createdAt));

  return rows.map(mapRow);
}

export async function adminDeleteDanmaku(danmakuId: string): Promise<void> {
  await requireAdmin();
  const result = await db
    .delete(danmakuMessages)
    .where(eq(danmakuMessages.id, danmakuId))
    .returning({ id: danmakuMessages.id });

  if (!result[0]) throw new Error("DANMAKU_NOT_FOUND");
  revalidatePath("/");
  revalidatePath("/admin/danmaku");
}
