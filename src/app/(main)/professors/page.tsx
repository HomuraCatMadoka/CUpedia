import type { Metadata } from "next";
import Link from "next/link";

import { CourseCatalogTabs } from "@/components/courses/course-catalog-tabs";
import { buttonVariants } from "@/components/ui/button";
import {
  ProfessorDirectoryFilters,
  ProfessorDirectorySort,
} from "@/components/professors/professor-directory-filters";
import { ProfessorPortrait } from "@/components/professors/professor-portrait";
import { getProfessorDirectory } from "@/lib/professor-actions";
import { formatProfessorName, formatProfessorNameText } from "@/lib/professor-name-format";

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
    rated?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sort =
    params.sort === "name" || params.sort === "rating"
      ? params.sort
      : "rating-count";
  const ratedOnly = params.rated === "1";
  const result = await getProfessorDirectory({
    q: params.q,
    department: params.department,
    page,
    sort,
    ratedOnly,
  });
  const query = params.q?.trim() || undefined;
  const department = result.departments.some(
    (option) => option.id === params.department,
  )
    ? params.department
    : undefined;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const filters = {
    q: query,
    department,
    sort: sort === "rating-count" ? undefined : sort,
    rated: ratedOnly ? "1" : undefined,
  };
  const currentHref = directoryHref({ ...filters, page: result.page });
  const filtering = Boolean(
    query || department || sort !== "rating-count" || ratedOnly,
  );

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
          key={`${query ?? ""}:${department ?? ""}:${sort}:${ratedOnly}`}
          departments={result.departments}
          initialDepartment={department}
          initialQuery={query}
          sort={sort}
          ratedOnly={ratedOnly}
        />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {filtering
                ? `找到 ${result.total} 位教授`
                : `全部 ${result.total} 位教授`}
              {totalPages > 1 ? `，第 ${result.page} / ${totalPages} 页` : ""}
              {ratedOnly ? "，仅看有评价" : ""}
            </p>
            {filtering ? (
              <Link
                href="/professors"
                className="rounded-sm text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                清除筛选
              </Link>
            ) : null}
          </div>
          <ProfessorDirectorySort sort={sort} />
        </div>

        {result.professors.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            <p>没有符合条件的教授。</p>
            {filtering && (
              <Link
                href="/professors"
                className="mt-3 inline-flex min-h-11 touch-manipulation items-center font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                清除筛选
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-3 gap-x-2 gap-y-4 sm:gap-x-5 sm:gap-y-5 lg:grid-cols-4">
            {result.professors.map((professor) => (
              <article
                key={professor.publicId}
                className="relative min-w-0 rounded-2xl transition-colors hover:bg-secondary/35 focus-within:bg-secondary/35"
              >
                <Link
                  href={`/professors/${professor.publicId}?from=${encodeURIComponent(currentHref)}`}
                  aria-label={`查看 ${formatProfessorNameText(professor.name)}（${professor.department ?? professor.faculty ?? "香港中文大学"}）的教授测评`}
                  className="group flex min-h-44 min-w-0 flex-col items-center justify-center rounded-2xl px-1 py-3 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-56 sm:px-3 sm:py-5"
                >
                  <ProfessorPortrait
                    variant="directory"
                    imageUrls={professor.imageUrls}
                    name={professor.name}
                  />
                  <div className="mt-3 min-w-0 max-w-full sm:mt-4">
                    <h2 className="line-clamp-2 text-sm font-medium tracking-[-0.02em] group-hover:underline group-hover:underline-offset-4 sm:text-base">
                      {formatProfessorName(professor.name)}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">
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
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "min-h-11 touch-manipulation",
                })}
              >
                上一页
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "min-h-11 opacity-50",
                })}
              >
                上一页
              </span>
            )}
            <span className="text-sm text-muted-foreground tabular-nums">
              {result.page} / {totalPages}
            </span>
            {result.page < totalPages ? (
              <Link
                href={directoryHref({ ...filters, page: result.page + 1 })}
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "min-h-11 touch-manipulation",
                })}
              >
                下一页
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "min-h-11 opacity-50",
                })}
              >
                下一页
              </span>
            )}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
