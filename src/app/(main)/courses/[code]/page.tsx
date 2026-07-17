export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import {
  getCourse,
  getCourseProfessorStats,
  getCourseReviews,
  getCourseRatingState,
  getCourseEnrollmentHistory,
  isCourseProfessorOptional,
} from "@/lib/course-review-actions";
import { formatCourseCode } from "@/app/(main)/courses/course-types";
import { getOptionalUser } from "@/lib/auth-guard";
import { Badge } from "@/components/ui/badge";
import { CourseReviewSection } from "@/components/courses/course-review-section";
import { CourseListBackLink } from "@/components/courses/course-list-back-link";
import { CourseGenderBadge } from "@/components/courses/course-gender-badge";
import { CourseReviewActions } from "@/components/courses/course-review-actions";
import { CourseEnrollmentHistory } from "@/components/courses/course-enrollment-history";
import {
  CourseDetailTabs,
  type CourseDetailTab,
} from "@/components/courses/course-detail-tabs";

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
  searchParams: Promise<{ from?: string; tab?: string }>;
}) {
  const { code } = await params;
  const { from, tab } = await searchParams;
  const course = await getCourse(code);
  if (!course) notFound();
  const courseCode = course.code;

  const activeTab: CourseDetailTab =
    tab === "enrollment" ? "enrollment" : "reviews";

  const hasCourseListSource =
    from === "/courses" || Boolean(from?.startsWith("/courses?"));
  const returnTo = hasCourseListSource ? from! : "/courses";
  function detailHref(targetTab: CourseDetailTab, hash?: string): string {
    const query = new URLSearchParams();
    if (hasCourseListSource) query.set("from", from!);
    if (targetTab === "enrollment") query.set("tab", "enrollment");
    const suffix = query.size ? `?${query.toString()}` : "";
    return `/courses/${encodeURIComponent(courseCode)}${suffix}${hash ?? ""}`;
  }

  const reviewsHref = detailHref("reviews");
  const enrollmentHref = detailHref("enrollment");

  const [
    ratingState,
    enrollmentHistory,
    user,
    professorOptional,
    reviews,
    professorStats,
  ] = await Promise.all([
    getCourseRatingState(course.code),
    getCourseEnrollmentHistory(course.code),
    getOptionalUser(),
    isCourseProfessorOptional(course.code),
    activeTab === "reviews"
      ? getCourseReviews(course.code)
      : Promise.resolve([]),
    activeTab === "reviews"
      ? getCourseProfessorStats(course.code)
      : Promise.resolve([]),
  ]);

  return (
    <div className="min-w-0 flex-1">
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
                <CourseGenderBadge restriction={course.genderRestriction} />
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

          <CourseReviewActions
            reviewCount={course.reviewCount}
            hasPublishedReview={ratingState?.lastScore != null}
            writeReviewHref={detailHref("reviews", "#course-review")}
            commentsHref={detailHref("reviews", "#peer-reviews")}
          />

          {course.description && (
            <p className="mt-5 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
              {course.description}
            </p>
          )}
        </div>

        <CourseDetailTabs
          activeTab={activeTab}
          reviewCount={course.reviewCount}
          enrollmentCount={enrollmentHistory.length}
          reviewsHref={reviewsHref}
          enrollmentHref={enrollmentHref}
        />

        {activeTab === "reviews" && ratingState && (
          <div className="mt-4">
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
              professorOptional={professorOptional}
            />
          </div>
        )}

        {activeTab === "enrollment" &&
          (enrollmentHistory.length > 0 ? (
            <CourseEnrollmentHistory enrollmentHistory={enrollmentHistory} />
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              暂无选课人数记录。
            </div>
          ))}
      </div>
    </div>
  );
}
