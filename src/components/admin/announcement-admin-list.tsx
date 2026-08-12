"use client";

import { useMemo, useState } from "react";
import { BellIcon, SearchIcon } from "lucide-react";

import {
  ANNOUNCEMENT_DATE_FORMATTER,
  ANNOUNCEMENT_LIFECYCLE_BADGE_VARIANTS,
  ANNOUNCEMENT_LIFECYCLE_LABELS,
  announcementLifecycleOf,
  announcementOfflineReason,
} from "@/components/admin/announcement-admin-presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnnouncementLifecycle } from "@/lib/announcement-lifecycle";
import type { AdminAnnouncement } from "@/lib/announcement-types";

type ManagementStatus = "draft" | "scheduled" | "live" | "offline";
type StatusFilter = "all" | ManagementStatus;

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "scheduled", label: "待发布" },
  { value: "live", label: "已上线" },
  { value: "offline", label: "已下线" },
];
const ANNOUNCEMENTS_PER_PAGE = 10;

function managementStatusOf(
  lifecycle: AnnouncementLifecycle,
): ManagementStatus {
  if (lifecycle === "published") return "live";
  if (lifecycle === "expired" || lifecycle === "withdrawn") return "offline";
  return lifecycle;
}

export function AnnouncementAdminList({
  announcements,
  now,
  selectedId,
  hiddenOnMobile,
  onSelect,
}: {
  announcements: AdminAnnouncement[];
  now: Date;
  selectedId: string | null;
  hiddenOnMobile: boolean;
  onSelect: (announcement: AdminAnnouncement) => void;
}) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const nowMs = now.getTime();
  const lifecycleCounts = useMemo(() => {
    const lifecycleNow = new Date(nowMs);
    const counts: Record<StatusFilter, number> = {
      all: announcements.length,
      draft: 0,
      scheduled: 0,
      live: 0,
      offline: 0,
    };
    for (const announcement of announcements) {
      counts[
        managementStatusOf(announcementLifecycleOf(announcement, lifecycleNow))
      ] += 1;
    }
    return counts;
  }, [announcements, nowMs]);
  const visibleAnnouncements = useMemo(() => {
    const lifecycleNow = new Date(nowMs);
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-HK");
    return announcements.filter((announcement) => {
      const lifecycle = announcementLifecycleOf(announcement, lifecycleNow);
      return (
        (filter === "all" || managementStatusOf(lifecycle) === filter) &&
        (!normalizedQuery ||
          announcement.title
            .toLocaleLowerCase("zh-HK")
            .includes(normalizedQuery))
      );
    });
  }, [announcements, filter, nowMs, query]);
  const pageCount = Math.max(
    1,
    Math.ceil(visibleAnnouncements.length / ANNOUNCEMENTS_PER_PAGE),
  );
  const currentPage = Math.min(page, pageCount);
  const paginatedAnnouncements = visibleAnnouncements.slice(
    (currentPage - 1) * ANNOUNCEMENTS_PER_PAGE,
    currentPage * ANNOUNCEMENTS_PER_PAGE,
  );
  const showListTools = announcements.length > ANNOUNCEMENTS_PER_PAGE;

  return (
    <section
      aria-label="公告列表"
      className={hiddenOnMobile ? "hidden space-y-4 lg:block" : "space-y-4"}
    >
      {showListTools && (
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="announcementSearch"
            autoComplete="off"
            aria-label="搜索公告标题"
            placeholder="搜索公告标题…"
            className="pl-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
      )}
      {showListTools && (
        <div
          className="flex gap-1 overflow-x-auto pb-1"
          aria-label="按状态筛选"
        >
          {FILTERS.map((item) => (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={filter === item.value ? "secondary" : "ghost"}
              aria-pressed={filter === item.value}
              onClick={() => {
                setFilter(item.value);
                setPage(1);
              }}
            >
              {item.label}
              <span className="tabular-nums text-muted-foreground">
                {lifecycleCounts[item.value]}
              </span>
            </Button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {announcements.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm font-medium">还没有公告</p>
            <p className="mt-1 text-xs text-muted-foreground">
              点击右上角“新建公告”开始创建。
            </p>
          </div>
        ) : visibleAnnouncements.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            没有符合当前条件的公告
          </p>
        ) : (
          paginatedAnnouncements.map((announcement) => {
            const lifecycle = announcementLifecycleOf(announcement, now);
            const reason = announcementOfflineReason(lifecycle);
            return (
              <button
                key={announcement.id}
                type="button"
                onClick={() => onSelect(announcement)}
                className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  selectedId === announcement.id
                    ? "border-foreground bg-accent"
                    : ""
                }`}
              >
                <span className="flex min-w-0 items-start justify-between gap-2">
                  <span className="line-clamp-2 min-w-0 font-medium">
                    {announcement.title}
                  </span>
                  <Badge
                    variant={ANNOUNCEMENT_LIFECYCLE_BADGE_VARIANTS[lifecycle]}
                  >
                    {ANNOUNCEMENT_LIFECYCLE_LABELS[lifecycle]}
                  </Badge>
                </span>
                <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {reason ?? (lifecycle === "scheduled" ? "计划" : "更新")}{" "}
                    {ANNOUNCEMENT_DATE_FORMATTER.format(
                      new Date(
                        lifecycle === "scheduled" && announcement.publishedAt
                          ? announcement.publishedAt
                          : announcement.updatedAt,
                      ),
                    )}
                  </span>
                  {announcement.notifyOnPublish &&
                    !announcement.notificationSentAt && (
                      <span className="inline-flex items-center gap-1">
                        <BellIcon className="size-3" aria-hidden="true" />
                        待通知
                      </span>
                    )}
                </span>
              </button>
            );
          })
        )}
      </div>
      {visibleAnnouncements.length > ANNOUNCEMENTS_PER_PAGE && (
        <nav
          aria-label="公告列表分页"
          className="flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            第 {currentPage} / {pageCount} 页
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={currentPage === pageCount}
            onClick={() =>
              setPage((current) => Math.min(pageCount, current + 1))
            }
          >
            下一页
          </Button>
        </nav>
      )}
    </section>
  );
}
