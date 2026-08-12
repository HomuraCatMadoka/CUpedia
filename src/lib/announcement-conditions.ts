import { and, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";

import { announcements } from "@/db/schema";

export function activeAnnouncementCondition(now: Date) {
  return and(
    lte(announcements.publishedAt, now),
    isNull(announcements.withdrawnAt),
    or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
  );
}

export function publishedAnnouncementCondition(now: Date) {
  return and(
    isNotNull(announcements.publishedAt),
    lte(announcements.publishedAt, now),
    isNull(announcements.withdrawnAt),
  );
}

export function notificationDueCondition(now: Date) {
  return and(
    activeAnnouncementCondition(now),
    eq(announcements.notifyOnPublish, true),
    isNull(announcements.notificationSentAt),
  );
}
