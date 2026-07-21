export const dynamic = "force-dynamic";

import Link from "next/link";
import { getCourses, getSubjects } from "@/lib/course-review-actions";
import type { CourseView } from "@/lib/course-review-actions";
import { formatCourseCode } from "@/app/(main)/courses/course-types";
import {
  CourseFilters,
  MobileCourseSort,
} from "@/components/courses/course-filters";
import { CourseSearch } from "@/components/courses/course-search";
import {
  CourseCardLink,
  CourseListNavigationReset,
} from "@/components/courses/course-card-link";
import { CourseGenderBadge } from "@/components/courses/course-gender-badge";
import { getAchievementNoticeCount } from "@/lib/achievement-notice-actions";

const COURSE_UPDATE_DATE_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  month: "numeric",
  day: "numeric",
});

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{
    credits?: string;
    q?: string;
    subject?: string;
    level?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const {
    credits,
    q,
    subject,
    level,
    sort: sortParam,
    page: pageParam,
  } = await searchParams;
  const sort = sortParam === "latest" ? "latest" : "rating-count";
  const sortQuery = sort === "latest" ? sort : undefined;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const [result, subjects, achievementNoticeCount] = await Promise.all([
    getCourses({ credits, query: q, subject, level, sort, page }),
    getSubjects(),
    getAchievementNoticeCount(),
  ]);
  const { courses, total, pageSize } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const filtering = Boolean(q || subject || credits || level);
  const currentListHref = pageHref(
    { credits, q, subject, level, sort: sortQuery },
    page,
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <CourseListNavigationReset />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">课程测评</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/courses/my-reviews"
              className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-foreground/40"
            >
              我的测评
            </Link>
            <Link
              href="/courses/achievements"
              className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-foreground/40"
            >
              我的成就
              {achievementNoticeCount > 0 && (
                <span
                  aria-label={`${achievementNoticeCount} 个未读成就提醒`}
                  className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs text-background"
                >
                  {achievementNoticeCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        <div className="mt-8 space-y-5">
          <CourseSearch initialQuery={q ?? ""} />
          <CourseFilters
            credits={credits}
            subject={subject}
            level={level}
            sort={sort}
            subjects={subjects}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {filtering ? `找到 ${total} 门课程` : `全部 ${total} 门课程`}
              {totalPages > 1 && ` · 第 ${page} / ${totalPages} 页`}
            </p>
            <MobileCourseSort sort={sort} />
            {totalPages > 1 && (
              <Pagination
                ariaLabel="课程顶部分页"
                page={page}
                totalPages={totalPages}
                filters={{ credits, q, subject, level, sort: sortQuery }}
              />
            )}
          </div>

          {courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
              没有符合条件的课程，试试调整筛选或搜索词。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => (
                <CourseCard
                  key={c.code}
                  course={c}
                  returnTo={currentListHref}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <Pagination
              ariaLabel="课程底部分页"
              page={page}
              totalPages={totalPages}
              filters={{ credits, q, subject, level, sort: sortQuery }}
              className="justify-center pt-3"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Pagination({
  ariaLabel,
  page,
  totalPages,
  filters,
  className = "",
}: {
  ariaLabel: string;
  page: number;
  totalPages: number;
  filters: Record<string, string | undefined>;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`flex items-center gap-3 ${className}`}
    >
      <PageLink href={pageHref(filters, page - 1)} disabled={page <= 1}>
        上一页
      </PageLink>
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages}
      </span>
      <PageLink
        href={pageHref(filters, page + 1)}
        disabled={page >= totalPages}
      >
        下一页
      </PageLink>
    </nav>
  );
}

function pageHref(filters: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/courses?${query}` : "/courses";
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return disabled ? (
    <span className="rounded-lg border px-3 py-1.5 text-sm text-muted-foreground opacity-50">
      {children}
    </span>
  ) : (
    <Link
      href={href}
      className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-foreground/40"
    >
      {children}
    </Link>
  );
}

function CourseCard({
  course: c,
  returnTo,
}: {
  course: CourseView;
  returnTo: string;
}) {
  const detailHref = `/courses/${c.code}?from=${encodeURIComponent(returnTo)}`;
  const updateLabel = formatUpdateLabel(c.latestCommentAt);

  return (
    <CourseCardLink
      href={detailHref}
      returnTo={returnTo}
      className="group flex min-h-[168px] flex-col justify-between rounded-xl border bg-card p-5 transition-colors hover:border-foreground/30"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs tracking-wide text-muted-foreground">
          {c.subject}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {c.units} 学分
        </span>
      </div>

      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            {formatCourseCode(c.code)}
          </h2>
          <CourseGenderBadge restriction={c.genderRestriction} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {c.title}
        </p>
      </div>

      <div className="mt-5">
        {c.rating !== null ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <span className="min-w-0 font-mono text-xs text-muted-foreground">
                {c.ratingCount} 次评分 · {c.reviewCount} 条评论
                {updateLabel && (
                  <span className="block truncate pt-1 md:hidden">
                    最后评论：{updateLabel}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-2xl leading-none font-semibold tabular-nums">
                {c.rating.toFixed(1)}
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                  /5
                </span>
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground"
                style={{ width: `${c.rating * 20}%` }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">
              暂无评分
              {updateLabel && (
                <span className="block pt-1 md:hidden">
                  最后评论：{updateLabel}
                </span>
              )}
            </span>
            <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
              成为第一个 →
            </span>
          </div>
        )}
      </div>
    </CourseCardLink>
  );
}

function formatUpdateLabel(value: string | null): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const elapsedHours = Math.max(0, (Date.now() - timestamp) / 3_600_000);
  if (elapsedHours < 1) return "刚刚";
  if (elapsedHours < 24) return `${Math.floor(elapsedHours)} 小时前`;
  if (elapsedHours < 48) return "昨天";
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays} 天前`;
  return COURSE_UPDATE_DATE_FORMATTER.format(new Date(timestamp));
}
