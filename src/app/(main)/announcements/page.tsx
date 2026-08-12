export const dynamic = "force-dynamic";

import { ChevronLeftIcon, ChevronRightIcon, MegaphoneIcon } from "lucide-react";
import Link from "next/link";

import { listPublicAnnouncements } from "@/lib/announcement-queries";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Hong_Kong",
});

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const requestedPage = Number(query.page ?? "1");
  const result = await listPublicAnnouncements(requestedPage);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="border-b pb-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <MegaphoneIcon className="size-4" aria-hidden="true" />
          公告中心
        </div>
        <h1 className="mt-2 text-3xl font-bold">全部公告</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          当前共有 {result.total} 条有效公告，每页显示 10 条。
        </p>
      </header>

      {result.announcements.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">暂无公告</p>
      ) : (
        <ol className="divide-y">
          {result.announcements.map((announcement) => (
            <li key={announcement.id}>
              <Link
                href={`/announcements/${announcement.id}`}
                className="group block rounded-md py-5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <time className="text-xs text-muted-foreground">
                  {DATE_FORMATTER.format(new Date(announcement.publishedAt))}
                </time>
                <h2 className="mt-1 text-lg font-semibold group-hover:underline group-hover:underline-offset-4">
                  {announcement.title}
                </h2>
                <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {announcement.content}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {result.pageCount > 1 && (
        <nav
          aria-label="公告分页"
          className="mt-6 flex items-center justify-between border-t pt-5"
        >
          {result.page > 1 ? (
            <Link
              href={`/announcements?page=${result.page - 1}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronLeftIcon className="size-4" aria-hidden="true" />
              上一页
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            第 {result.page} / {result.pageCount} 页
          </span>
          {result.page < result.pageCount ? (
            <Link
              href={`/announcements?page=${result.page + 1}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              下一页
              <ChevronRightIcon className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
