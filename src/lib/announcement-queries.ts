import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm";

import { db } from "@/db";
import { announcements } from "@/db/schema";
import {
  ANNOUNCEMENT_PAGE_SIZE,
  type AdminAnnouncement,
  type PublicAnnouncement,
  isAnnouncementId,
} from "@/lib/announcement-types";

function activeAnnouncementWhere(now: Date) {
  return and(
    lte(announcements.publishedAt, now),
    isNull(announcements.withdrawnAt),
    or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
  );
}

function publishedAnnouncementWhere(now: Date) {
  return and(
    isNotNull(announcements.publishedAt),
    lte(announcements.publishedAt, now),
    isNull(announcements.withdrawnAt),
  );
}

function toPublicAnnouncement(row: {
  id: string;
  title: string;
  content: string;
  publishedAt: Date | null;
}): PublicAnnouncement {
  if (!row.publishedAt) throw new Error("公告尚未发布");
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export async function listFeaturedAnnouncements(
  limit = 3,
): Promise<PublicAnnouncement[]> {
  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      publishedAt: announcements.publishedAt,
    })
    .from(announcements)
    .where(activeAnnouncementWhere(new Date()))
    .orderBy(desc(announcements.priority), desc(announcements.publishedAt))
    .limit(Math.max(1, Math.min(3, Math.floor(limit))));
  return rows.map(toPublicAnnouncement);
}

export async function countPublishedAnnouncements(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(announcements)
    .where(publishedAnnouncementWhere(new Date()));
  return Number(row?.value ?? 0);
}

export async function listPublicAnnouncements(page = 1): Promise<{
  announcements: PublicAnnouncement[];
  page: number;
  pageCount: number;
  total: number;
}> {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const now = new Date();
  const where = publishedAnnouncementWhere(now);
  const [totalRow] = await db
    .select({ value: count() })
    .from(announcements)
    .where(where);
  const total = Number(totalRow?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / ANNOUNCEMENT_PAGE_SIZE));
  const currentPage = Math.min(safePage, pageCount);
  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      publishedAt: announcements.publishedAt,
    })
    .from(announcements)
    .where(where)
    .orderBy(desc(announcements.publishedAt), desc(announcements.priority))
    .limit(ANNOUNCEMENT_PAGE_SIZE)
    .offset((currentPage - 1) * ANNOUNCEMENT_PAGE_SIZE);
  return {
    announcements: rows.map(toPublicAnnouncement),
    page: currentPage,
    pageCount,
    total,
  };
}

export async function getPublicAnnouncement(
  id: string,
): Promise<PublicAnnouncement | null> {
  if (!isAnnouncementId(id)) return null;
  const [row] = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      publishedAt: announcements.publishedAt,
    })
    .from(announcements)
    .where(
      and(eq(announcements.id, id), publishedAnnouncementWhere(new Date())),
    )
    .limit(1);
  return row ? toPublicAnnouncement(row) : null;
}

export async function adminListAnnouncements(): Promise<AdminAnnouncement[]> {
  const rows = await db
    .select()
    .from(announcements)
    .orderBy(asc(announcements.publishedAt), desc(announcements.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    priority: row.priority,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    notificationSentAt: row.notificationSentAt?.toISOString() ?? null,
    notifyOnPublish: row.notifyOnPublish,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
