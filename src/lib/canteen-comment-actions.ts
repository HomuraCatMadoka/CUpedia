"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { canteenDishComments, canteenMenuItems, users } from "@/db/schema";
import { requireAdmin, requireCommentAuth } from "@/lib/auth-guard";
import {
  isCanteenMockMode,
  mockAdminDeleteDishComment,
  mockCreateDishComment,
  mockDeleteDishComment,
  mockGetCommentsForMenuItem,
  mockMenuItemExists,
  mockUpdateDishComment,
} from "@/lib/canteen-mock";
import type { CanteenDishComment } from "@/lib/canteen-types";
import { validateCommentContent } from "@/lib/canteen-types";
import { assertNoSensitiveContent } from "@/lib/sensitive-content";

async function assertMenuItemExists(menuItemId: string): Promise<void> {
  if (isCanteenMockMode()) {
    if (!mockMenuItemExists(menuItemId)) {
      throw new Error("MENU_ITEM_NOT_FOUND");
    }
    return;
  }
  const items = await db
    .select({ id: canteenMenuItems.id })
    .from(canteenMenuItems)
    .where(eq(canteenMenuItems.id, menuItemId))
    .limit(1);
  if (!items[0]) throw new Error("MENU_ITEM_NOT_FOUND");
}

export async function getCommentsForMenuItem(
  menuItemId: string,
): Promise<CanteenDishComment[]> {
  if (isCanteenMockMode()) return mockGetCommentsForMenuItem(menuItemId);

  const rows = await db
    .select({
      id: canteenDishComments.id,
      menuItemId: canteenDishComments.menuItemId,
      userId: canteenDishComments.userId,
      content: canteenDishComments.content,
      createdAt: canteenDishComments.createdAt,
      updatedAt: canteenDishComments.updatedAt,
      authorNickname: users.nickname,
    })
    .from(canteenDishComments)
    .innerJoin(users, eq(canteenDishComments.userId, users.id))
    .where(eq(canteenDishComments.menuItemId, menuItemId))
    .orderBy(asc(canteenDishComments.createdAt));

  return rows.map((row) => ({
    id: row.id,
    menuItemId: row.menuItemId,
    userId: row.userId,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    authorNickname: row.authorNickname,
  }));
}

export async function createDishComment(
  menuItemId: string,
  contentInput: unknown,
): Promise<CanteenDishComment> {
  const content = validateCommentContent(contentInput);
  assertNoSensitiveContent(content);
  const user = await requireCommentAuth();
  await assertMenuItemExists(menuItemId);

  if (isCanteenMockMode()) {
    return mockCreateDishComment(menuItemId, user.id, user.nickname, content);
  }

  const [row] = await db
    .insert(canteenDishComments)
    .values({
      menuItemId,
      userId: user.id,
      content,
    })
    .returning({
      id: canteenDishComments.id,
      menuItemId: canteenDishComments.menuItemId,
      userId: canteenDishComments.userId,
      content: canteenDishComments.content,
      createdAt: canteenDishComments.createdAt,
      updatedAt: canteenDishComments.updatedAt,
    });

  return {
    ...row,
    authorNickname: user.nickname,
  };
}

export async function updateDishComment(
  commentId: string,
  contentInput: unknown,
): Promise<CanteenDishComment> {
  const content = validateCommentContent(contentInput);
  assertNoSensitiveContent(content);
  const user = await requireCommentAuth();

  if (isCanteenMockMode()) {
    return mockUpdateDishComment(commentId, user.id, content);
  }

  const [row] = await db
    .update(canteenDishComments)
    .set({ content, updatedAt: new Date() })
    .where(
      and(
        eq(canteenDishComments.id, commentId),
        eq(canteenDishComments.userId, user.id),
      ),
    )
    .returning({
      id: canteenDishComments.id,
      menuItemId: canteenDishComments.menuItemId,
      userId: canteenDishComments.userId,
      content: canteenDishComments.content,
      createdAt: canteenDishComments.createdAt,
      updatedAt: canteenDishComments.updatedAt,
    });

  if (!row) throw new Error("COMMENT_NOT_FOUND");

  return {
    ...row,
    authorNickname: user.nickname,
  };
}

export async function deleteDishComment(commentId: string): Promise<void> {
  const user = await requireCommentAuth();

  if (isCanteenMockMode()) {
    mockDeleteDishComment(commentId, user.id);
    return;
  }

  const result = await db
    .delete(canteenDishComments)
    .where(
      and(
        eq(canteenDishComments.id, commentId),
        eq(canteenDishComments.userId, user.id),
      ),
    )
    .returning({ id: canteenDishComments.id });

  if (!result[0]) throw new Error("COMMENT_NOT_FOUND");
}

export async function adminDeleteDishComment(commentId: string): Promise<void> {
  await requireAdmin();

  if (isCanteenMockMode()) {
    mockAdminDeleteDishComment(commentId);
    return;
  }

  const result = await db
    .delete(canteenDishComments)
    .where(eq(canteenDishComments.id, commentId))
    .returning({ id: canteenDishComments.id });

  if (!result[0]) throw new Error("COMMENT_NOT_FOUND");
}
