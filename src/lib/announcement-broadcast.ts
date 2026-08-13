import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { announcements, notifications, users } from "@/db/schema";
import { notificationDueCondition } from "@/lib/announcement-conditions";

type AnnouncementTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

async function insertAnnouncementNotifications(
  tx: AnnouncementTransaction,
  announcement: { id: string; title: string; publishedAt: Date },
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
        'announcementId', ${announcement.id}::text,
        'title', ${announcement.title}::text
      ),
      ${announcement.id}::uuid
    from ${users}
    where ${users.banned} = false
      and ${users.createdAt} <= ${announcement.publishedAt}
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
    .where(and(eq(announcements.id, id), notificationDueCondition(now)))
    .returning({
      id: announcements.id,
      title: announcements.title,
      actorId: announcements.updatedBy,
      publishedAt: announcements.publishedAt,
    });
  if (claimed?.publishedAt) {
    await insertAnnouncementNotifications(
      tx,
      {
        id: claimed.id,
        title: claimed.title,
        publishedAt: claimed.publishedAt,
      },
      claimed.actorId,
    );
    return true;
  }
  return false;
}
