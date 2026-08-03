import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  canteenDanmakuMessages,
  canteens,
  danmakuMessages,
  users,
} from "@/db/schema";
import type {
  AdminDanmakuMessage,
  DanmakuMessage,
  PublicDanmakuMessage,
} from "@/lib/danmaku-types";

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

function mapPublicRow(row: PublicDanmakuMessage): PublicDanmakuMessage {
  return {
    id: row.id,
    content: row.content,
    month: row.month,
    createdAt: row.createdAt,
  };
}

/** Hub danmaku history (all months). Flyover caps via messagesForFlyover. */
export async function listDanmaku(): Promise<PublicDanmakuMessage[]> {
  const rows = await db
    .select({
      id: danmakuMessages.id,
      content: danmakuMessages.content,
      month: danmakuMessages.month,
      createdAt: danmakuMessages.createdAt,
    })
    .from(danmakuMessages)
    .orderBy(asc(danmakuMessages.createdAt));

  return rows.map(mapPublicRow);
}

/** Per-canteen danmaku history (all months). */
export async function listCanteenDanmaku(
  canteenId: string,
): Promise<PublicDanmakuMessage[]> {
  const rows = await db
    .select({
      id: canteenDanmakuMessages.id,
      content: canteenDanmakuMessages.content,
      month: canteenDanmakuMessages.month,
      createdAt: canteenDanmakuMessages.createdAt,
    })
    .from(canteenDanmakuMessages)
    .where(eq(canteenDanmakuMessages.canteenId, canteenId))
    .orderBy(asc(canteenDanmakuMessages.createdAt));

  return rows.map(mapPublicRow);
}

/** @deprecated Use listDanmaku — kept for call-site migration. */
export const listCurrentMonthDanmaku = listDanmaku;

/** @deprecated Use listCanteenDanmaku — kept for call-site migration. */
export const listCurrentMonthCanteenDanmaku = listCanteenDanmaku;

export async function adminListDanmakuHistory(): Promise<AdminDanmakuMessage[]> {
  const [hubRows, canteenRows] = await Promise.all([
    db
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
      .orderBy(desc(danmakuMessages.createdAt)),
    db
      .select({
        id: canteenDanmakuMessages.id,
        userId: canteenDanmakuMessages.userId,
        content: canteenDanmakuMessages.content,
        month: canteenDanmakuMessages.month,
        createdAt: canteenDanmakuMessages.createdAt,
        authorNickname: users.nickname,
        canteenId: canteenDanmakuMessages.canteenId,
        canteenName: canteens.name,
      })
      .from(canteenDanmakuMessages)
      .innerJoin(users, eq(canteenDanmakuMessages.userId, users.id))
      .innerJoin(canteens, eq(canteenDanmakuMessages.canteenId, canteens.id))
      .orderBy(desc(canteenDanmakuMessages.createdAt)),
  ]);

  return [
    ...hubRows.map((row) => ({
      ...mapRow(row),
      scope: "hub" as const,
      canteenId: null,
      canteenName: null,
    })),
    ...canteenRows.map((row) => ({
      ...mapRow(row),
      scope: "canteen" as const,
      canteenId: row.canteenId,
      canteenName: row.canteenName,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** @deprecated Use adminListDanmakuHistory. */
export const adminListCurrentMonthDanmaku = adminListDanmakuHistory;
