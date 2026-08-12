import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { announcements, notifications, users } from "@/db/schema";

type AnnouncementTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

const ANNOUNCEMENT_BROADCAST_BATCH_SIZE = 10;

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
): Promise<boolean> {
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
      ),
    )
    .returning({
      id: announcements.id,
      title: announcements.title,
      actorId: announcements.updatedBy,
    });
  if (claimed) {
    await insertAnnouncementNotifications(tx, claimed, claimed.actorId);
    return true;
  }
  return false;
}

export async function broadcastDueAnnouncements(): Promise<number> {
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
      ),
    )
    .orderBy(asc(announcements.publishedAt))
    .limit(ANNOUNCEMENT_BROADCAST_BATCH_SIZE);

  let processed = 0;
  for (const { id } of due) {
    const claimed = await db.transaction((tx) =>
      broadcastAnnouncementIfDue(tx, id, now),
    );
    if (claimed) processed += 1;
  }
  return processed;
}
