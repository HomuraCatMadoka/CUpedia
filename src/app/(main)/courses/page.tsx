export const dynamic = "force-dynamic";

import Link from "next/link";
import { getCourses } from "@/lib/course-review-actions";
import { formatCourseCode } from "@/app/(main)/courses/course-types";
import { CourseFilters } from "@/components/courses/course-filters";
import { CourseSearch } from "@/components/courses/course-search";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ credits?: string; q?: string }>;
}) {
  const { credits, q } = await searchParams;

  const courses = await getCourses({ credits, query: q });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <h1 className="text-2xl font-bold">课程测评</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            搜索课程、查看同学评价，登录后即可匿名评论与点赞
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-10 lg:flex-row">
          <CourseFilters credits={credits} />

          <section className="flex-1 space-y-8">
            <CourseSearch initialQuery={q ?? ""} />

            <p className="text-sm text-muted-foreground">
              {q ? `找到 ${courses.length} 门课程` : "热门课程（有评价的优先）"}
            </p>

            {courses.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                没有符合条件的课程，试试调整筛选或搜索词。
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {courses.map((c) => (
                  <Link
                    key={c.code}
                    href={`/courses/${c.code}`}
                    prefetch={false}
                    className="group flex min-h-[160px] flex-col justify-between rounded-2xl border p-6 transition-all duration-300 hover:border-foreground/40 hover:shadow-sm"
                  >
                    <div>
                      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {c.subject}
                      </span>
                      <h2 className="mt-1 text-lg font-medium">
                        {formatCourseCode(c.code)}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {c.title}
                      </p>
                    </div>
                    <div className="mt-6 flex items-end justify-between">
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span>{c.units} 学分</span>
                        <span>
                          {c.ratingCount > 0
                            ? `${c.ratingCount} 次评分`
                            : "暂无评分"}
                          {" · "}
                          {c.reviewCount} 条评论
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-xs text-muted-foreground">
                          推荐指数
                        </span>
                        {c.rating !== null ? (
                          <span className="text-2xl font-semibold tracking-tight">
                            {c.rating.toFixed(1)}
                            <span className="text-xs font-normal text-muted-foreground">
                              {" "}
                              /10
                            </span>
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            暂无
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
