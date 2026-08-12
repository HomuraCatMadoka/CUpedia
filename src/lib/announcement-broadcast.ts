import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { announcements, notifications, users } from "@/db/schema";

type AnnouncementTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

async function insertAnnouncementNotifications(
  tx: AnnouncementTransaction,
  announcement: { id: string; title: string },
  actorId: string | null,
) {
  await tx.execute(sql`
    insert into ${notifications} (
      recipient_id,
      actor_id,
      kind,
      metadata,
      announcement_id
    )
    select
      ${users.id},
      ${actorId}::uuid,
      'announcement_published',
      jsonb_build_object(
        'announcementId', ${announcement.id},
        'title', ${announcement.title}
      ),
      ${announcement.id}::uuid
    from ${users}
    where ${users.banned} = false
    on conflict do nothing
  `);
}

export async function broadcastAnnouncementIfDue(
  tx: AnnouncementTransaction,
  id: string,
  now: Date,
) {
  const [claimed] = await tx
    .update(announcements)
    .set({ notificationSentAt: now })
    .where(
      and(
        eq(announcements.id, id),
        eq(announcements.notifyOnPublish, true),
        isNull(announcements.notificationSentAt),
        isNull(announcements.withdrawnAt),
        lte(announcements.publishedAt, now),
        or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
      ),
    )
    .returning({
      id: announcements.id,
      title: announcements.title,
      actorId: announcements.updatedBy,
    });
  if (claimed) {
    await insertAnnouncementNotifications(tx, claimed, claimed.actorId);
  }
}

export async function broadcastDueAnnouncements(): Promise<void> {
  const now = new Date();
  const due = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(
      and(
        eq(announcements.notifyOnPublish, true),
        isNull(announcements.notificationSentAt),
        isNull(announcements.withdrawnAt),
        lte(announcements.publishedAt, now),
        or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
      ),
    );
  await Promise.all(
    due.map(({ id }) =>
      db.transaction((tx) => broadcastAnnouncementIfDue(tx, id, now)),
    ),
  );
}
