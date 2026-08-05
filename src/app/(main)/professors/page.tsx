import type { Metadata } from "next";
import Link from "next/link";

import { CourseCatalogTabs } from "@/components/courses/course-catalog-tabs";
import { ProfessorDirectoryFilters } from "@/components/professors/professor-directory-filters";
import { ProfessorPortrait } from "@/components/professors/professor-portrait";
import { getProfessorDirectory } from "@/lib/professor-actions";
import { PROFESSOR_RANKING_MIN_RATINGS } from "@/lib/professor-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "查找教授",
  description: "按姓名、学院或学系查找中大教授及相关课程测评。",
};

function directoryHref(
  values: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value && value !== 1) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/professors?${query}` : "/professors";
}

export default async function ProfessorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    department?: string;
    page?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sort =
    params.sort === "rating-count" || params.sort === "rating"
      ? params.sort
      : "name";
  const result = await getProfessorDirectory({
    q: params.q,
    department: params.department,
    page,
    sort,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const filters = {
    q: params.q,
    department: params.department,
    sort: sort === "name" ? undefined : sort,
  };
  const currentHref = directoryHref({ ...filters, page: result.page });

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b pb-5">
          <div>
            <p className="text-sm text-muted-foreground">课程测评</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-balance">
              查找教授
            </h1>
          </div>
          <CourseCatalogTabs active="professors" />
        </div>

        <ProfessorDirectoryFilters
          departments={result.departments}
          initialDepartment={params.department}
          initialQuery={params.q}
          sort={sort}
          rankingMinimum={PROFESSOR_RANKING_MIN_RATINGS}
        />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            找到 {result.total} 位教授
            {totalPages > 1 ? ` · 第 ${result.page} / ${totalPages} 页` : ""}
            {sort === "rating"
              ? ` · 仅展示至少 ${PROFESSOR_RANKING_MIN_RATINGS} 份测评`
              : ""}
          </p>
          {params.q || params.department || sort !== "name" ? (
            <Link
              href="/professors"
              className="rounded-sm text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              清除筛选
            </Link>
          ) : null}
        </div>

        {result.professors.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            <p>没有符合条件的教授。</p>
            <Link
              href="/professors"
              className="mt-3 inline-block font-medium text-foreground underline underline-offset-4"
            >
              清除筛选
            </Link>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
            {result.professors.map((professor) => (
              <article
                key={professor.publicId}
                className="relative min-w-0 rounded-2xl transition-colors hover:bg-secondary/35 focus-within:bg-secondary/35"
              >
                <Link
                  href={`/professors/${professor.publicId}?from=${encodeURIComponent(currentHref)}`}
                  aria-label={`查看 ${professor.name} 的教授测评`}
                  className="group flex min-h-56 min-w-0 flex-col items-center justify-center rounded-2xl px-3 py-5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <ProfessorPortrait
                    variant="directory"
                    imageUrl={professor.imageUrl}
                    name={professor.name}
                  />
                  <div className="mt-4 min-w-0 max-w-full">
                    <h2 className="line-clamp-2 font-medium tracking-[-0.02em] group-hover:underline group-hover:underline-offset-4">
                      {professor.name}
                    </h2>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {professor.department ??
                        professor.faculty ??
                        "香港中文大学"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {professor.rating === null
                        ? "暂无评分"
                        : `${professor.rating.toFixed(1)} / 5，${professor.ratingCount} 份`}
                    </p>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <nav
            aria-label="教授目录分页"
            className="mt-8 flex items-center justify-center gap-3"
          >
            {result.page > 1 ? (
              <Link
                href={directoryHref({ ...filters, page: result.page - 1 })}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                上一页
              </Link>
            ) : (
              <span className="rounded-lg border px-3 py-2 text-sm text-muted-foreground opacity-50">
                上一页
              </span>
            )}
            <span className="text-sm text-muted-foreground tabular-nums">
              {result.page} / {totalPages}
            </span>
            {result.page < totalPages ? (
              <Link
                href={directoryHref({ ...filters, page: result.page + 1 })}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                下一页
              </Link>
            ) : (
              <span className="rounded-lg border px-3 py-2 text-sm text-muted-foreground opacity-50">
                下一页
              </span>
            )}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
