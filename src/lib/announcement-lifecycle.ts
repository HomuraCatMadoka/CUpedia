export type AnnouncementLifecycle =
  | "draft"
  | "scheduled"
  | "published"
  | "expired"
  | "withdrawn";

export type AnnouncementTimestamps = {
  publishedAt: Date | null;
  withdrawnAt: Date | null;
  expiresAt: Date | null;
};

export type AnnouncementNotificationState = AnnouncementTimestamps & {
  notifyOnPublish: boolean;
  notificationSentAt: Date | null;
};

export function getAnnouncementLifecycle(
  announcement: AnnouncementTimestamps,
  now: Date,
): AnnouncementLifecycle {
  if (announcement.withdrawnAt) return "withdrawn";
  if (!announcement.publishedAt) return "draft";
  if (announcement.publishedAt > now) return "scheduled";
  if (announcement.expiresAt && announcement.expiresAt <= now) return "expired";
  return "published";
}

export function resolveAnnouncementPublication(
  existing: AnnouncementTimestamps,
  input: { published: boolean; publishAt: Date | null },
  now: Date,
): Pick<AnnouncementTimestamps, "publishedAt" | "withdrawnAt"> {
  const lifecycle = getAnnouncementLifecycle(existing, now);

  if (!input.published) {
    if (lifecycle === "draft" || lifecycle === "scheduled") {
      return { publishedAt: null, withdrawnAt: null };
    }
    return {
      publishedAt: existing.publishedAt,
      withdrawnAt: existing.withdrawnAt ?? now,
    };
  }

  if (lifecycle === "published" || lifecycle === "expired") {
    return { publishedAt: existing.publishedAt, withdrawnAt: null };
  }

  return {
    publishedAt: input.publishAt ?? now,
    withdrawnAt: null,
  };
}

export function resolveAnnouncementNotificationIntent(
  existing: AnnouncementNotificationState,
  input: {
    published: boolean;
    publishAt: Date | null;
    sendNotification: boolean;
  },
  now: Date,
): boolean {
  if (existing.notificationSentAt) return existing.notifyOnPublish;

  // Without a background scheduler, only an announcement published now can
  // create notification records. Future publication remains a visibility
  // schedule and must not leave an undeliverable notification intent behind.
  if (input.publishAt && input.publishAt > now) return false;

  const lifecycle = getAnnouncementLifecycle(existing, now);
  if (lifecycle === "draft" || lifecycle === "scheduled") {
    return input.published && input.sendNotification;
  }
  // Immediate publication delivers in the same transaction. A public record
  // that still has no notification timestamp is stale scheduler-era state,
  // not a deferred delivery to preserve during later edits.
  if (lifecycle === "published") return false;
  return false;
}
