"use server";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import type {
  CampusMapNoteEventNotificationMetadata,
  CourseReviewReplyNotificationMetadata,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { deliverCampusMapNoteNotifications } from "@/lib/campus-map/map-notes";

const PAGE_SIZE = 10;

export type NotificationView = {
  id: string;
  actorNickname: string;
  actorAvatarUrl: string | null;
  message: string;
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
  await projectPendingCampusMapNoteNotifications();
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
  await projectPendingCampusMapNoteNotifications();
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
      const destination = notificationDestination(
        row.kind,
        row.metadata,
        row.actorNickname || "用户",
      );
      return {
        id: row.id,
        actorNickname: row.actorNickname || "用户",
        actorAvatarUrl: row.actorAvatarUrl,
        message: destination.message,
        createdAt: row.createdAt.toISOString(),
        href: destination.href,
        read: row.readAt !== null,
      };
    }),
    hasMore: rows.length > PAGE_SIZE,
  };
}

async function projectPendingCampusMapNoteNotifications(): Promise<void> {
  const result = await deliverCampusMapNoteNotifications(100);
  if (result.failed > 0) {
    throw new Error("地图备注通知暂时无法载入，请稍后重试");
  }
}

function notificationDestination(
  kind: (typeof notifications.$inferSelect)["kind"],
  metadata: (typeof notifications.$inferSelect)["metadata"],
  actorNickname: string,
): { message: string; href: string } {
  if (kind === "campus_map_note_event") {
    const note = metadata as CampusMapNoteEventNotificationMetadata;
    return {
      message: `${actorNickname}更新了你订阅的地图备注`,
      href: `/campus-map/notes/${encodeURIComponent(note.noteId)}#event-${encodeURIComponent(note.eventId)}`,
    };
  }
  const reply = metadata as CourseReviewReplyNotificationMetadata;
  const query = new URLSearchParams({
    review: reply.reviewId,
    reply: reply.replyId,
  });
  return {
    message: `${actorNickname} 回复了你在 ${reply.courseCode} 的评论`,
    href: `/courses/${encodeURIComponent(reply.courseCode)}?${query.toString()}`,
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
