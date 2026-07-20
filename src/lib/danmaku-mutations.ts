import { eq } from "drizzle-orm";
import { db } from "@/db";
import { canteenDanmakuMessages, canteens, danmakuMessages } from "@/db/schema";
import {
  assertCanteenDanmakuRateLimitInTransaction,
  assertDanmakuRateLimitInTransaction,
} from "@/lib/danmaku-rate-limit";
import type { DanmakuMessage } from "@/lib/danmaku-types";
import { validateDanmakuContent } from "@/lib/danmaku-types";
import { currentMonthHkt } from "@/lib/hkt-datetime";
import { assertNoSensitiveContent } from "@/lib/sensitive-content";

/** Internal write helper — not a Server Action; callers must derive identity from session. */
export async function insertDanmakuForUser(
  user: { id: string; nickname: string },
  contentInput: unknown,
): Promise<DanmakuMessage> {
  const content = validateDanmakuContent(contentInput);
  assertNoSensitiveContent(content);
  return db.transaction(async (tx) => {
    await assertDanmakuRateLimitInTransaction(user.id, tx);
    const month = currentMonthHkt();
    const [row] = await tx
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

    return {
      ...row,
      authorNickname: user.nickname,
    };
  });
}

/** Writes to canteen_danmaku_messages — never the hub danmaku_messages table. */
export async function insertCanteenDanmakuForUser(
  user: { id: string; nickname: string },
  canteenId: string,
  contentInput: unknown,
): Promise<DanmakuMessage> {
  const canteen = await db.query.canteens.findFirst({
    where: eq(canteens.id, canteenId),
    columns: { id: true },
  });
  if (!canteen) throw new Error("CANTEEN_NOT_FOUND");

  const content = validateDanmakuContent(contentInput);
  assertNoSensitiveContent(content);
  return db.transaction(async (tx) => {
    await assertCanteenDanmakuRateLimitInTransaction(user.id, canteenId, tx);
    const month = currentMonthHkt();
    const [row] = await tx
      .insert(canteenDanmakuMessages)
      .values({
        canteenId,
        userId: user.id,
        content,
        month,
      })
      .returning({
        id: canteenDanmakuMessages.id,
        userId: canteenDanmakuMessages.userId,
        content: canteenDanmakuMessages.content,
        month: canteenDanmakuMessages.month,
        createdAt: canteenDanmakuMessages.createdAt,
      });

    return {
      ...row,
      authorNickname: user.nickname,
    };
  });
}
