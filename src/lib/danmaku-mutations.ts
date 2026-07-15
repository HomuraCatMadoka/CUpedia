import { db } from "@/db";
import { danmakuMessages } from "@/db/schema";
import { assertDanmakuRateLimit } from "@/lib/danmaku-rate-limit";
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
  await assertDanmakuRateLimit(user.id);

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

  return {
    ...row,
    authorNickname: user.nickname,
  };
}
