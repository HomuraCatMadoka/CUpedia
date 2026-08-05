import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfessorPortrait } from "@/components/professors/professor-portrait";
import { getProfessorDetail } from "@/lib/professor-actions";

const scoreFormat = new Intl.NumberFormat("zh-HK", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function safeReturnPath(value: string | undefined): string {
  return value?.startsWith("/professors?") || value === "/professors"
    ? value
    : "/professors";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const professor = await getProfessorDetail((await params).publicId);
  return professor
    ? {
        title: `${professor.name} | 教授测评`,
        description: `查看 ${professor.name} 的相关课程与课程测评。`,
      }
    : { title: "教授不存在" };
}

export default async function ProfessorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { publicId } = await params;
  const professor = await getProfessorDetail(publicId);
  if (!professor) notFound();
  const returnTo = safeReturnPath((await searchParams).from);
  const detailPath = `/professors/${professor.publicId}?from=${encodeURIComponent(returnTo)}`;
  const reviewHref = (courseCode: string) =>
    `/courses/${encodeURIComponent(courseCode)}?professor=${professor.publicId}&from=${encodeURIComponent(detailPath)}#course-review`;
  const primaryReviewHref =
    professor.courses.length === 1
      ? reviewHref(professor.courses[0]!.code)
      : "#related-courses";

  return (
    <div className="min-w-0 flex-1">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <Link
          href={returnTo}
          className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          ← 返回教授目录
        </Link>

        <section className="mt-8 grid gap-6 border-b pb-8 sm:grid-cols-[144px_1fr_auto] sm:items-center">
          <ProfessorPortrait
            imageUrl={professor.imageUrl}
            name={professor.name}
          />
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
              {professor.name}
            </h1>
            {professor.title ? (
              <p className="mt-2 text-sm font-medium">{professor.title}</p>
            ) : null}
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              {professor.department ?? professor.faculty}
            </p>
            {professor.profile ? (
              <a
                href={professor.profile.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex min-h-9 items-center rounded-sm text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {professor.profile.kind === "department"
                  ? "院系主页 ↗"
                  : "Research Portal ↗"}
                <span className="sr-only">，在新标签页打开</span>
              </a>
            ) : null}
          </div>

          <div className="min-w-40 sm:text-right">
            {professor.rating === null ? (
              <p className="text-sm text-muted-foreground">暂无评分</p>
            ) : (
              <>
                <p className="text-4xl font-light tracking-[-0.06em] tabular-nums">
                  {scoreFormat.format(professor.rating)}
                  <span className="ml-1 text-sm text-muted-foreground">
                    / 5
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {professor.ratingCount} 份
                  {professor.ratingCount < 5 ? "，样本较少" : ""}
                </p>
              </>
            )}
            {professor.courses.length ? (
              <Link
                href={primaryReviewHref}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {professor.courses.length === 1 ? "写评价" : "选择课程"}
              </Link>
            ) : null}
          </div>
        </section>

        <section id="related-courses" className="mt-9 scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight">相关课程</h2>
          {professor.courses.length ? (
            <div className="mt-4 divide-y border-y">
              {professor.courses.map((course) => (
                <article
                  key={course.code}
                  className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/courses/${encodeURIComponent(course.code)}?from=${encodeURIComponent(detailPath)}`}
                      className="rounded-sm font-medium hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        translate="no"
                        className="mr-2 font-mono text-xs text-muted-foreground"
                      >
                        {course.code}
                      </span>
                      {course.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {course.academicYears.slice(0, 3).join("、") ||
                        "课程记录"}
                      {course.ratingCount
                        ? `，${scoreFormat.format(course.rating ?? 0)} / 5`
                        : ""}
                    </p>
                  </div>
                  {professor.courses.length > 1 ? (
                    <Link
                      href={reviewHref(course.code)}
                      aria-label={`评价 ${professor.name} 的 ${course.code}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      评价
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">暂无课程记录。</p>
          )}
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4 border-b pb-3">
            <h2 className="text-xl font-semibold tracking-tight">同学测评</h2>
            {professor.reviews.length === 20 ? (
              <span className="text-xs text-muted-foreground">最近 20 条</span>
            ) : null}
          </div>
          {professor.reviews.length ? (
            <ul className="divide-y">
              {professor.reviews.map((review) => (
                <li key={review.id} className="py-5">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-xs text-muted-foreground">
                      {review.courseCode}
                      {review.academicYear ? ` / ${review.academicYear}` : ""}
                      {review.term ? ` / ${review.term}` : ""}
                    </p>
                    {review.score !== null ? (
                      <span className="text-sm font-medium tabular-nums">
                        {scoreFormat.format(review.score)} / 5
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 break-words text-sm leading-6">
                    {review.content}
                  </p>
                  <Link
                    href={`/courses/${encodeURIComponent(review.courseCode)}?tab=reviews&review=${review.id}#course-review-${review.id}`}
                    className="mt-3 inline-block rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    查看课程讨论
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-5 text-sm text-muted-foreground">暂无测评。</p>
          )}
        </section>
      </div>
    </div>
  );
}
