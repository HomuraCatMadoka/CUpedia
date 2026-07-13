"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { danmakuMessages } from "@/db/schema";
import { requireAdmin, requireAuth } from "@/lib/auth-guard";
import { insertDanmakuForUser } from "@/lib/danmaku-mutations";
import {
  adminListCurrentMonthDanmaku,
  listCurrentMonthDanmaku,
} from "@/lib/danmaku-queries";
import type { DanmakuMessage } from "@/lib/danmaku-types";

export { listCurrentMonthDanmaku };

export async function createDanmaku(
  contentInput: unknown,
): Promise<DanmakuMessage> {
  const user = await requireAuth();
  const message = await insertDanmakuForUser(
    { id: user.id, nickname: user.nickname },
    contentInput,
  );
  revalidatePath("/");
  return message;
}

export async function adminListDanmaku(): Promise<DanmakuMessage[]> {
  await requireAdmin();
  return adminListCurrentMonthDanmaku();
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
