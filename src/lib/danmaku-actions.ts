"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { canteenDanmakuMessages, danmakuMessages } from "@/db/schema";
import { requireAdmin, requireAuth } from "@/lib/auth-guard";
import { insertDanmakuForUser } from "@/lib/danmaku-mutations";
import {
  adminListDanmakuHistory,
  listCanteenDanmaku as queryListCanteenDanmaku,
  listDanmaku as queryListDanmaku,
} from "@/lib/danmaku-queries";
import type {
  AdminDanmakuMessage,
  DanmakuMessage,
  PublicDanmakuMessage,
} from "@/lib/danmaku-types";
import { assertContributorComplete } from "@/lib/contributor-account";

/** Hub danmaku history — async wrapper required for "use server" exports. */
export async function listDanmaku(): Promise<PublicDanmakuMessage[]> {
  return queryListDanmaku();
}

/** Per-canteen danmaku history — async wrapper required for "use server" exports. */
export async function listCanteenDanmaku(
  canteenId: string,
): Promise<PublicDanmakuMessage[]> {
  return queryListCanteenDanmaku(canteenId);
}

export async function createDanmaku(
  contentInput: unknown,
): Promise<DanmakuMessage> {
  const user = await assertContributorComplete(await requireAuth());
  const message = await insertDanmakuForUser(
    { id: user.id, nickname: user.nickname },
    contentInput,
  );
  revalidatePath("/");
  return message;
}

export async function adminListDanmaku(): Promise<AdminDanmakuMessage[]> {
  await requireAdmin();
  return adminListDanmakuHistory();
}

export async function adminDeleteDanmaku(
  target:
    | { id: string; scope: "hub" }
    | { id: string; scope: "canteen"; canteenId: string },
): Promise<void> {
  await requireAdmin();
  const table =
    target.scope === "canteen" ? canteenDanmakuMessages : danmakuMessages;
  const result = await db
    .delete(table)
    .where(eq(table.id, target.id))
    .returning({ id: table.id });

  if (!result[0]) throw new Error("DANMAKU_NOT_FOUND");
  revalidatePath("/");
  revalidatePath("/admin/danmaku");
  if (target.scope === "canteen") {
    revalidatePath(`/canteen/${target.canteenId}`);
  }
}
