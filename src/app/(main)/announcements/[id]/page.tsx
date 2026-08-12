export const dynamic = "force-dynamic";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { getPublicAnnouncement } from "@/lib/announcement-queries";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Hong_Kong",
});

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const announcement = await getPublicAnnouncement(id);
  if (!announcement) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-balance">公告不存在</h1>
        <p className="mt-3 text-sm text-pretty text-muted-foreground">
          这条公告可能尚未发布、已被撤回，或链接无效。
        </p>
        <Link
          href="/announcements"
          className="mt-6 inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          返回全部公告
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href="/announcements"
        className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        返回全部公告
      </Link>
      <article className="mt-5">
        <header className="border-b pb-5">
          <h1 className="text-3xl font-bold tracking-tight">
            {announcement.title}
          </h1>
          <time className="mt-3 block text-sm text-muted-foreground">
            发布于 {DATE_FORMATTER.format(new Date(announcement.publishedAt))}
          </time>
        </header>
        <div className="mt-6 whitespace-pre-wrap text-base leading-8">
          {announcement.content}
        </div>
      </article>
    </div>
  );
}
