export const dynamic = "force-dynamic";

import Link from "next/link";
import { getCourses, getSubjects } from "@/lib/course-review-actions";
import type { CourseView } from "@/lib/course-review-actions";
import { formatCourseCode } from "@/app/(main)/courses/course-types";
import { CourseFilters } from "@/components/courses/course-filters";
import { CourseSearch } from "@/components/courses/course-search";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{
    credits?: string;
    q?: string;
    subject?: string;
    level?: string;
  }>;
}) {
  const { credits, q, subject, level } = await searchParams;

  const [courses, subjects] = await Promise.all([
    getCourses({ credits, query: q, subject, level }),
    getSubjects(),
  ]);

  const filtering = Boolean(q || subject || credits || level);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div>
          <h1 className="text-2xl font-bold">课程测评</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            搜索课程、查看同学评价，登录后即可匿名评论与点赞
          </p>
        </div>

        <div className="mt-8 space-y-5">
          <CourseSearch initialQuery={q ?? ""} />
          <CourseFilters
            credits={credits}
            subject={subject}
            level={level}
            subjects={subjects}
          />

          <p className="text-sm text-muted-foreground">
            {filtering
              ? `找到 ${courses.length} 门课程`
              : "热门课程（有评价的优先）"}
          </p>

          {courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
              没有符合条件的课程，试试调整筛选或搜索词。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => (
                <CourseCard key={c.code} course={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CourseCard({ course: c }: { course: CourseView }) {
  return (
    <Link
      href={`/courses/${c.code}`}
      prefetch={false}
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
        <h2 className="text-base font-semibold tracking-tight">
          {formatCourseCode(c.code)}
        </h2>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {c.title}
        </p>
      </div>

      <div className="mt-5">
        {c.rating !== null ? (
          <>
            <div className="flex items-end justify-between">
              <span className="font-mono text-xs text-muted-foreground">
                {c.ratingCount} 次评分 · {c.reviewCount} 条评论
              </span>
              <span className="text-2xl leading-none font-semibold tabular-nums">
                {c.rating.toFixed(1)}
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                  /10
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
            </span>
            <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
              成为第一个 →
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
