"use server";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";

const PAGE_SIZE = 10;

export type NotificationView = {
  id: string;
  actorNickname: string;
  actorAvatarUrl: string | null;
  courseCode: string;
  createdAt: string;
  href: string;
  read: boolean;
};

export type NotificationPage = {
  notifications: NotificationView[];
  hasMore: boolean;
};

export async function getUnreadNotificationCount(): Promise<number> {
  const user = await requireAuth();
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(eq(notifications.recipientId, user.id), isNull(notifications.readAt)),
    );
  return Number(row?.value ?? 0);
}

export async function getNotifications(offset = 0): Promise<NotificationPage> {
  const user = await requireAuth();
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.floor(offset))
    : 0;
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      metadata: notifications.metadata,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorNickname: users.nickname,
      actorAvatarUrl: users.image,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .where(eq(notifications.recipientId, user.id))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(PAGE_SIZE + 1)
    .offset(safeOffset);

  return {
    notifications: rows.slice(0, PAGE_SIZE).map((row) => {
      const query = new URLSearchParams({
        review: row.metadata.reviewId,
        reply: row.metadata.replyId,
      });
      return {
        id: row.id,
        actorNickname: row.actorNickname || "用户",
        actorAvatarUrl: row.actorAvatarUrl,
        courseCode: row.metadata.courseCode,
        createdAt: row.createdAt.toISOString(),
        href: `/courses/${encodeURIComponent(row.metadata.courseCode)}?${query.toString()}`,
        read: row.readAt !== null,
      };
    }),
    hasMore: rows.length > PAGE_SIZE,
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  if (typeof id !== "string" || !id) throw new Error("通知不存在");
  const user = await requireAuth();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.recipientId, user.id),
        isNull(notifications.readAt),
      ),
    );
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireAuth();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.recipientId, user.id), isNull(notifications.readAt)),
    );
}
