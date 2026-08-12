"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { announcements, notifications, users } from "@/db/schema";
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

async function broadcastAnnouncement(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  announcement: { id: string; title: string },
  actorId: string,
) {
  await tx.execute(sql`
    insert into ${notifications} (recipient_id, actor_id, kind, metadata)
    select
      ${users.id},
      ${actorId}::uuid,
      'announcement_published',
      jsonb_build_object(
        'announcementId', ${announcement.id},
        'title', ${announcement.title}
      )
    from ${users}
    where ${users.banned} = false
  `);
}

export async function adminListAnnouncements(): Promise<AdminAnnouncement[]> {
  await requireAdmin();
  return queryAdminListAnnouncements();
}

export async function createAnnouncement(
  input: AnnouncementInput,
): Promise<{ id: string }> {
  const admin = await requireAdmin();
  const parsed = parseAnnouncementInput(input);
  const now = new Date();
  if (parsed.published && parsed.expiresAt && parsed.expiresAt <= now) {
    throw new Error("失效时间必须晚于发布时间");
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(announcements)
      .values({
        title: parsed.title,
        content: parsed.content,
        priority: parsed.priority,
        publishedAt: parsed.published ? now : null,
        expiresAt: parsed.expiresAt,
        createdBy: admin.id,
        updatedBy: admin.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: announcements.id, title: announcements.title });
    if (!row) throw new Error("公告创建失败");

    if (parsed.published && parsed.sendNotification) {
      await broadcastAnnouncement(tx, row, admin.id);
      await tx
        .update(announcements)
        .set({ notificationSentAt: now })
        .where(eq(announcements.id, row.id));
    }
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
        notificationSentAt: announcements.notificationSentAt,
      })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    if (!existing) throw new Error("公告不存在");

    const publishedAt = parsed.published ? (existing.publishedAt ?? now) : null;
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
        expiresAt: parsed.expiresAt,
        updatedBy: admin.id,
        updatedAt: now,
      })
      .where(eq(announcements.id, id))
      .returning({ id: announcements.id, title: announcements.title });
    if (!updated) throw new Error("公告不存在");

    if (
      parsed.published &&
      parsed.sendNotification &&
      !existing.notificationSentAt
    ) {
      await broadcastAnnouncement(tx, updated, admin.id);
      await tx
        .update(announcements)
        .set({ notificationSentAt: now })
        .where(eq(announcements.id, id));
    }
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
