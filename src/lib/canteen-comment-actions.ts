"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  canteenDishComments,
  canteenMenuItems,
  canteens,
  users,
} from "@/db/schema";
import { requireAdmin, requireCommentAuth } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import {
  isCanteenMockMode,
  mockAdminDeleteDishComment,
  mockAdminListDishCommentAuditLogs,
  mockAdminListRecentDishComments,
  mockCreateDishComment,
  mockDeleteDishComment,
  mockGetCommentCountsForCanteen,
  mockGetCommentsForMenuItem,
  mockMenuItemExists,
  mockUpdateDishComment,
} from "@/lib/canteen-mock";
import {
  adminListRecentDishComments,
  countCommentsByMenuItemForCanteen,
} from "@/lib/canteen-comment-queries";
import type { AdminDishComment, CanteenDishComment } from "@/lib/canteen-types";
import {
  ADMIN_AUDIT_LOG_LIST_LIMIT,
  DISH_COMMENT_DELETE_AUDIT_ACTION,
  type AdminAuditLog,
  type DishCommentDeleteAuditDetails,
} from "@/lib/admin-audit-types";
import { listRecentDishCommentAuditLogs } from "@/lib/admin-audit-queries";
import { validateCommentContent } from "@/lib/canteen-types";
import { assertNoSensitiveContent } from "@/lib/sensitive-content";
import { assertContributorComplete } from "@/lib/contributor-account";

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
    .where(
      and(
        eq(canteenMenuItems.id, menuItemId),
        eq(canteenMenuItems.isAvailable, true),
      ),
    )
    .limit(1);
  if (!items[0]) throw new Error("MENU_ITEM_NOT_FOUND");
}

export async function getCommentCountsForCanteen(
  canteenId: string,
): Promise<Record<string, number>> {
  if (isCanteenMockMode()) return mockGetCommentCountsForCanteen(canteenId);
  return countCommentsByMenuItemForCanteen(canteenId);
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
  const user = await assertContributorComplete(await requireCommentAuth());
  await assertMenuItemExists(menuItemId);

  if (isCanteenMockMode()) {
    return mockCreateDishComment(
      menuItemId,
      user.id,
      user.nickname,
      user.email,
      content,
    );
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

export async function adminListDishComments(): Promise<AdminDishComment[]> {
  await requireAdmin();
  if (isCanteenMockMode()) return mockAdminListRecentDishComments();
  return adminListRecentDishComments();
}

export async function adminListDishCommentAuditLogs(): Promise<
  AdminAuditLog[]
> {
  await requireAdmin();
  if (isCanteenMockMode()) {
    return mockAdminListDishCommentAuditLogs(ADMIN_AUDIT_LOG_LIST_LIMIT);
  }
  return listRecentDishCommentAuditLogs();
}

export async function adminDeleteDishComment(commentId: string): Promise<void> {
  const admin = await requireAdmin();

  if (isCanteenMockMode()) {
    mockAdminDeleteDishComment(commentId, admin);
    revalidatePath("/admin/comments");
    return;
  }

  await db.transaction(async (tx) => {
    const [comment] = await tx
      .select({
        id: canteenDishComments.id,
        userId: canteenDishComments.userId,
        content: canteenDishComments.content,
        createdAt: canteenDishComments.createdAt,
        authorEmail: users.email,
        authorNickname: users.nickname,
        menuItemId: canteenMenuItems.id,
        menuItemName: canteenMenuItems.name,
        canteenId: canteens.id,
        canteenName: canteens.name,
      })
      .from(canteenDishComments)
      .innerJoin(users, eq(canteenDishComments.userId, users.id))
      .innerJoin(
        canteenMenuItems,
        eq(canteenDishComments.menuItemId, canteenMenuItems.id),
      )
      .innerJoin(canteens, eq(canteenMenuItems.canteenId, canteens.id))
      .where(eq(canteenDishComments.id, commentId))
      .limit(1);

    if (!comment) throw new Error("COMMENT_NOT_FOUND");

    const result = await tx
      .delete(canteenDishComments)
      .where(eq(canteenDishComments.id, commentId))
      .returning({ id: canteenDishComments.id });

    if (!result[0]) throw new Error("COMMENT_NOT_FOUND");

    const details: DishCommentDeleteAuditDetails = {
      content: comment.content,
      authorEmail: comment.authorEmail,
      authorNickname: comment.authorNickname,
      canteenId: comment.canteenId,
      canteenName: comment.canteenName,
      menuItemId: comment.menuItemId,
      menuItemName: comment.menuItemName,
      commentCreatedAt: comment.createdAt.toISOString(),
    };

    await tx.insert(adminAuditLogs).values({
      actorUserId: admin.id,
      actorEmail: admin.email,
      actorNickname: admin.nickname,
      action: DISH_COMMENT_DELETE_AUDIT_ACTION,
      targetType: "canteen_dish_comment",
      targetId: comment.id,
      targetUserId: comment.userId,
      details,
    });
  });

  revalidatePath("/admin/comments");
}
