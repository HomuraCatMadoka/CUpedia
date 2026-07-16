export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import {
  getCourse,
  getCourseProfessorStats,
  getCourseReviews,
  getCourseRatingState,
  getCourseEnrollmentHistory,
} from "@/lib/course-review-actions";
import { formatCourseCode } from "@/app/(main)/courses/course-types";
import { getOptionalUser } from "@/lib/auth-guard";
import { Badge } from "@/components/ui/badge";
import { CourseReviewSection } from "@/components/courses/course-review-section";
import { CourseListBackLink } from "@/components/courses/course-list-back-link";

function recentAcademicYears(now = new Date()): string[] {
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 5 }, (_, index) => {
    const year = start - index;
    return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  });
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { code } = await params;
  const { from } = await searchParams;
  const course = await getCourse(code);
  if (!course) notFound();

  const hasCourseListSource =
    from === "/courses" || Boolean(from?.startsWith("/courses?"));
  const returnTo = hasCourseListSource ? from! : "/courses";

  const [reviews, ratingState, enrollmentHistory, professorStats, user] =
    await Promise.all([
      getCourseReviews(course.code),
      getCourseRatingState(course.code),
      getCourseEnrollmentHistory(course.code),
      getCourseProfessorStats(course.code),
      getOptionalUser(),
    ]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <CourseListBackLink
          href={returnTo}
          restoreHistory={hasCourseListSource}
        />

        <div className="mt-4 rounded-2xl border p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {course.subject}
              </span>
              <h1 className="mt-1 text-2xl font-bold">
                {formatCourseCode(course.code)}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {course.title}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{course.units} 学分</Badge>
                {course.terms.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-secondary/60 px-6 py-4 text-center">
              <p className="text-xs tracking-wider text-muted-foreground uppercase">
                综合推荐指数
              </p>
              <p className="mt-1 text-4xl font-light tracking-tighter">
                {course.rating !== null ? course.rating.toFixed(1) : "—"}
                {course.rating !== null && (
                  <span className="ml-1 text-sm text-muted-foreground">
                    / 5
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {course.ratingCount > 0
                  ? `${course.ratingCount} 次评分`
                  : "暂无用户评分"}
                {" · "}
                {course.reviewCount} 条评论
              </p>
            </div>
          </div>

          {course.description && (
            <p className="mt-5 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
              {course.description}
            </p>
          )}
        </div>

        {enrollmentHistory.length > 0 && (
          <section className="mt-6 rounded-2xl border p-6">
            <h2 className="text-lg font-semibold">选课人数参考</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              根据 CUHK Teaching Timetable 的名额减剩余名额推算
            </p>
            {[...new Set(enrollmentHistory.map((row) => row.academicYear))].map(
              (academicYear) => (
                <div key={academicYear} className="mt-5 space-y-5">
                  <h3 className="text-sm font-semibold">{academicYear}</h3>
                  {[
                    ...new Set(
                      enrollmentHistory
                        .filter((row) => row.academicYear === academicYear)
                        .map((row) => row.term),
                    ),
                  ].map((term) => (
                    <div key={term}>
                      <h4 className="border-b pb-2 text-sm font-medium">
                        {term}
                      </h4>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        {enrollmentHistory
                          .filter(
                            (row) =>
                              row.academicYear === academicYear &&
                              row.term === term,
                          )
                          .map((row) => (
                            <div
                              key={row.section ?? "all"}
                              className="rounded-xl bg-secondary/50 p-4"
                            >
                              {row.section && (
                                <p className="text-sm font-medium">
                                  Section {row.section}
                                </p>
                              )}
                              <p className="mt-1 text-2xl font-semibold">
                                {row.enrolled} 人
                              </p>
                              <p className="text-xs text-muted-foreground">
                                总名额 {row.quota}
                              </p>
                              {row.instructors.length > 0 && (
                                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                                  {row.instructors.join(" · ")}
                                </p>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ),
            )}
          </section>
        )}

        {ratingState && (
          <div className="mt-8">
            <CourseReviewSection
              key={`${course.code}-${ratingState.ratingCount}-${ratingState.myRatingCount}`}
              code={course.code}
              reviews={reviews}
              ratingState={ratingState}
              professorStats={professorStats}
              academicYears={[
                ...new Set([
                  ...enrollmentHistory.map((row) => row.academicYear),
                  ...(ratingState.lastAcademicYear
                    ? [ratingState.lastAcademicYear]
                    : []),
                  ...recentAcademicYears(),
                ]),
              ]
                .sort()
                .reverse()}
              isAuthenticated={!!user}
            />
          </div>
        )}
      </div>
    </div>
  );
}
