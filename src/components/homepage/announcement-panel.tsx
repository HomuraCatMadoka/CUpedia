"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MegaphoneIcon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import type { PublicAnnouncement } from "@/lib/announcement-types";
import { cn } from "@/lib/utils";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  month: "long",
  day: "numeric",
  timeZone: "Asia/Hong_Kong",
});

function AnnouncementBody({
  announcement,
}: {
  announcement: PublicAnnouncement;
}) {
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    const paragraph = paragraphRef.current;
    if (!paragraph) return;
    const measure = () =>
      setIsOverflowing(paragraph.scrollHeight > paragraph.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [announcement.content]);

  return (
    <div>
      <p
        ref={paragraphRef}
        className="mt-3 max-h-60 max-w-3xl whitespace-pre-line text-sm leading-6 opacity-80 line-clamp-10"
      >
        {announcement.content}
      </p>
      {isOverflowing && (
        <Link
          href={`/announcements/${announcement.id}`}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md text-sm font-semibold underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          查看详情
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export function AnnouncementPanel({
  announcements,
  total,
}: {
  announcements: PublicAnnouncement[];
  total: number;
}) {
  const [selectedId, setSelectedId] = useState(announcements[0]?.id ?? "");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  if (announcements.length === 0) return null;

  const selected =
    announcements.find((announcement) => announcement.id === selectedId) ??
    announcements[0];
  const selectedIndex = announcements.findIndex(
    (announcement) => announcement.id === selected.id,
  );
  const date = DATE_FORMATTER.format(new Date(selected.publishedAt));

  function selectRelativeAnnouncement(offset: number) {
    const nextIndex = Math.min(
      announcements.length - 1,
      Math.max(0, selectedIndex + offset),
    );
    setSelectedId(announcements[nextIndex].id);
  }

  return (
    <section
      aria-label="近期公告"
      aria-roledescription={announcements.length > 1 ? "轮播" : undefined}
      className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100"
    >
      {isCollapsed ? (
        <button
          type="button"
          aria-label={`展开公告：${selected.title}`}
          onClick={() => setIsCollapsed(false)}
          className="flex min-h-16 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-background/40 active:bg-background/60 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none md:px-6"
        >
          <MegaphoneIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="shrink-0 text-sm font-semibold">近期公告</span>
          <span className="text-sm opacity-40" aria-hidden="true">
            ·
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {selected.title}
          </span>
          <time className="hidden text-xs opacity-65 sm:block">{date}</time>
          <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
        </button>
      ) : (
        <>
          <article
            aria-atomic="true"
            aria-live="polite"
            aria-label={`${selected.title}，第 ${selectedIndex + 1} 条，共 ${announcements.length} 条`}
            className="touch-pan-y p-4 md:p-6"
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              if (touchStartX.current === null) return;
              const endX = event.changedTouches[0]?.clientX;
              if (endX === undefined) return;
              const distance = endX - touchStartX.current;
              touchStartX.current = null;
              if (Math.abs(distance) < 48) return;
              selectRelativeAnnouncement(distance < 0 ? 1 : -1);
            }}
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <MegaphoneIcon className="size-4" aria-hidden="true" />
                  近期公告
                </span>
                <div className="flex items-center gap-1">
                  <time className="text-xs opacity-70">{date}</time>
                  <button
                    type="button"
                    aria-label={`收起整个公告区：${selected.title}`}
                    onClick={() => setIsCollapsed(true)}
                    className="flex size-11 items-center justify-center rounded-full opacity-65 transition-colors hover:bg-background/60 hover:opacity-100 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <ChevronUpIcon className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <h2 className="mt-3 text-xl font-semibold md:text-2xl">
                {selected.title}
              </h2>
              <AnnouncementBody announcement={selected} />
            </div>
            <span className="mt-4 flex items-center gap-1.5 text-xs opacity-70">
              <BellIcon className="size-3.5" aria-hidden="true" />
              重要更新会同步到通知中心
            </span>
          </article>

          <footer className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-amber-300 bg-background/40 px-4 dark:border-amber-800 md:px-6">
            <span aria-hidden="true" />
            {announcements.length > 1 ? (
              <div
                role="group"
                aria-label="选择公告"
                className="flex items-center justify-center gap-1"
              >
                {announcements.map((announcement, index) => {
                  const active = announcement.id === selected.id;
                  return (
                    <button
                      key={announcement.id}
                      type="button"
                      aria-current={active ? "true" : undefined}
                      aria-label={`查看第 ${index + 1} 条公告：${announcement.title}`}
                      onClick={() => setSelectedId(announcement.id)}
                      className="flex size-11 items-center justify-center rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "block h-2 rounded-full transition-[width,background-color]",
                          active
                            ? "w-5 bg-current"
                            : "w-2 bg-current opacity-30 hover:opacity-55",
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <span aria-hidden="true" />
            )}
            <Link
              href="/announcements"
              prefetch={false}
              className="justify-self-end text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              全部公告（{total}）
            </Link>
          </footer>
        </>
      )}
    </section>
  );
}
