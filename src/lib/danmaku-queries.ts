import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { danmakuMessages, users } from "@/db/schema";
import type { DanmakuMessage } from "@/lib/danmaku-types";
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

export async function adminListCurrentMonthDanmaku(): Promise<DanmakuMessage[]> {
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
