import {
  getAnnouncementLifecycle,
  type AnnouncementLifecycle,
} from "@/lib/announcement-lifecycle";
import type { AdminAnnouncement } from "@/lib/announcement-types";

export const ANNOUNCEMENT_DATE_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Hong_Kong",
});

export const ANNOUNCEMENT_LIFECYCLE_LABELS: Record<
  AnnouncementLifecycle,
  string
> = {
  draft: "草稿",
  scheduled: "待发布",
  published: "已发布",
  expired: "已失效",
  withdrawn: "已撤回",
};

export const ANNOUNCEMENT_LIFECYCLE_BADGE_VARIANTS: Record<
  AnnouncementLifecycle,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  scheduled: "outline",
  published: "default",
  expired: "secondary",
  withdrawn: "destructive",
};

export function announcementLifecycleOf(
  announcement: AdminAnnouncement,
  now: Date,
): AnnouncementLifecycle {
  return getAnnouncementLifecycle(
    {
      publishedAt: announcement.publishedAt
        ? new Date(announcement.publishedAt)
        : null,
      withdrawnAt: announcement.withdrawnAt
        ? new Date(announcement.withdrawnAt)
        : null,
      expiresAt: announcement.expiresAt
        ? new Date(announcement.expiresAt)
        : null,
    },
    now,
  );
}

export function announcementOfflineReason(
  lifecycle: AnnouncementLifecycle,
): string | null {
  if (lifecycle === "expired") return "到期下线";
  if (lifecycle === "withdrawn") return "手动撤回";
  return null;
}
