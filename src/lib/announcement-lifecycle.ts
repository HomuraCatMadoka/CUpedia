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
