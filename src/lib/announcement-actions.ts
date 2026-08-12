"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { announcements } from "@/db/schema";
import {
  broadcastAnnouncementIfDue,
  broadcastDueAnnouncements,
} from "@/lib/announcement-broadcast";
import { adminListAnnouncements as queryAdminListAnnouncements } from "@/lib/announcement-queries";
import {
  isAnnouncementId,
  parseAnnouncementInput,
  type AdminAnnouncement,
  type AnnouncementInput,
} from "@/lib/announcement-types";
import { requireAdmin } from "@/lib/auth-guard";

function revalidateAnnouncementPages(id?: string) {
  revalidatePath("/");
  revalidatePath("/announcements");
  revalidatePath("/admin/announcements");
  if (id) revalidatePath(`/announcements/${id}`);
}

export async function adminListAnnouncements(): Promise<AdminAnnouncement[]> {
  await requireAdmin();
  await broadcastDueAnnouncements();
  return queryAdminListAnnouncements();
}

export async function createAnnouncement(
  input: AnnouncementInput,
): Promise<{ id: string }> {
  const admin = await requireAdmin();
  const parsed = parseAnnouncementInput(input);
  const now = new Date();
  const publishedAt = parsed.published ? (parsed.publishAt ?? now) : null;
  if (publishedAt && parsed.expiresAt && parsed.expiresAt <= publishedAt) {
    throw new Error("失效时间必须晚于发布时间");
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(announcements)
      .values({
        title: parsed.title,
        content: parsed.content,
        priority: parsed.priority,
        publishedAt,
        withdrawnAt: null,
        expiresAt: parsed.expiresAt,
        notifyOnPublish: parsed.published && parsed.sendNotification,
        createdBy: admin.id,
        updatedBy: admin.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: announcements.id, title: announcements.title });
    if (!row) throw new Error("公告创建失败");

    await broadcastAnnouncementIfDue(tx, row.id, now);
    return row;
  });

  revalidateAnnouncementPages(created.id);
  return { id: created.id };
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementInput,
): Promise<void> {
  if (!isAnnouncementId(id)) throw new Error("公告不存在");
  const admin = await requireAdmin();
  const parsed = parseAnnouncementInput(input);
  const now = new Date();

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        publishedAt: announcements.publishedAt,
        withdrawnAt: announcements.withdrawnAt,
        notificationSentAt: announcements.notificationSentAt,
      })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    if (!existing) throw new Error("公告不存在");

    const wasPublic = Boolean(
      existing.publishedAt && existing.publishedAt <= now,
    );
    const publishedAt = parsed.published
      ? (parsed.publishAt ??
        (existing.withdrawnAt ? now : (existing.publishedAt ?? now)))
      : wasPublic
        ? existing.publishedAt
        : null;
    const withdrawnAt = parsed.published ? null : wasPublic ? now : null;
    if (publishedAt && parsed.expiresAt && parsed.expiresAt <= publishedAt) {
      throw new Error("失效时间必须晚于发布时间");
    }

    const [updated] = await tx
      .update(announcements)
      .set({
        title: parsed.title,
        content: parsed.content,
        priority: parsed.priority,
        publishedAt,
        withdrawnAt,
        expiresAt: parsed.expiresAt,
        notifyOnPublish:
          !existing.notificationSentAt && parsed.published
            ? parsed.sendNotification
            : undefined,
        updatedBy: admin.id,
        updatedAt: now,
      })
      .where(eq(announcements.id, id))
      .returning({ id: announcements.id, title: announcements.title });
    if (!updated) throw new Error("公告不存在");

    await broadcastAnnouncementIfDue(tx, updated.id, now);
  });

  revalidateAnnouncementPages(id);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  if (!isAnnouncementId(id)) throw new Error("公告不存在");
  await requireAdmin();
  const [deleted] = await db
    .delete(announcements)
    .where(
      and(
        eq(announcements.id, id),
        isNull(announcements.publishedAt),
        isNull(announcements.notificationSentAt),
      ),
    )
    .returning({ id: announcements.id });
  if (!deleted) throw new Error("只能删除从未发布的草稿");
  revalidateAnnouncementPages(id);
}
