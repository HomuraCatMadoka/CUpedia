export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getCourseDetail } from "@/lib/course-review-actions";
import { createPageStageTimer } from "@/lib/page-performance";
import { formatCourseCode } from "@/app/(main)/courses/course-types";
import { Badge } from "@/components/ui/badge";
import { CourseReviewSection } from "@/components/courses/course-review-section";
import { CourseDescription } from "@/components/courses/course-description";
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
  searchParams: Promise<{
    from?: string;
    tab?: string;
    review?: string;
    reply?: string;
    professor?: string;
  }>;
}) {
  const [{ code }, { from, tab, review, reply, professor }, measure] =
    await Promise.all([
      params,
      searchParams,
      createPageStageTimer("/courses/[code]"),
    ]);
  const activeTab: CourseDetailTab =
    tab === "enrollment" ? "enrollment" : "reviews";
  const detail = await measure("detail", () =>
    getCourseDetail(code, {
      tab: activeTab,
      professor,
      review,
      reply,
    }),
  );
  if (!detail) notFound();
  const { course } = detail;

  const hasCourseListSource =
    from === "/courses" || Boolean(from?.startsWith("/courses?"));
  const hasReviewHistorySource = from === "/courses/my-reviews";
  const hasProfessorSource = Boolean(
    from?.startsWith("/professors/") && !from.includes(".."),
  );
  const hasReturnSource =
    hasCourseListSource || hasReviewHistorySource || hasProfessorSource;
  const returnTo = hasReturnSource ? from! : "/courses";
  function detailHref(targetTab: CourseDetailTab, hash?: string): string {
    const query = new URLSearchParams();
    if (hasReturnSource) query.set("from", from!);
    if (professor) query.set("professor", professor);
    if (targetTab === "enrollment") query.set("tab", "enrollment");
    const suffix = query.size ? `?${query.toString()}` : "";
    return `/courses/${encodeURIComponent(course.code)}${suffix}${hash ?? ""}`;
  }

  const reviewsHref = detailHref("reviews");
  const enrollmentHref = detailHref("enrollment");

  const returnLabel = hasProfessorSource
    ? "返回教授详情"
    : hasReviewHistorySource
      ? "返回我的测评"
      : undefined;

  return (
    <div className="min-w-0 flex-1">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <CourseListBackLink
          href={returnTo}
          restoreHistory={hasCourseListSource}
          label={returnLabel}
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
            hasPublishedReview={detail.hasPublishedReview}
            writeReviewHref={detailHref("reviews", "#course-review")}
            commentsHref={detailHref("reviews", "#peer-reviews")}
          />

          {course.description && (
            <CourseDescription text={course.description} />
          )}
        </div>

        <CourseDetailTabs
          activeTab={activeTab}
          reviewCount={course.reviewCount}
          reviewsHref={reviewsHref}
          enrollmentHref={enrollmentHref}
        />

        {detail.tab === "reviews" && detail.targetMissing && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
          >
            消息不存在
          </p>
        )}

        {detail.tab === "reviews" && (
          <div className="mt-4">
            <CourseReviewSection
              key={JSON.stringify([
                course.code,
                professor,
                review,
                reply,
                detail.viewerKey,
              ])}
              code={course.code}
              reviewPage={detail.reviewPage}
              ratingState={detail.ratingState}
              professorStats={detail.professorStats}
              reviewedProfessors={detail.reviewedProfessors}
              initialProfessorId={detail.initialProfessorId}
              academicYears={[
                ...new Set([
                  ...detail.editorAcademicYears,
                  ...(detail.ratingState.lastAcademicYear
                    ? [detail.ratingState.lastAcademicYear]
                    : []),
                  ...recentAcademicYears(),
                ]),
              ]
                .sort()
                .reverse()}
              isAuthenticated={detail.isAuthenticated}
              viewerKey={detail.viewerKey}
              professorOptional={detail.professorOptional}
              prefillProfessor={detail.prefillProfessor}
              targetReview={detail.targetReview}
              targetReviewId={detail.targetReviewId}
              targetReplyId={detail.targetReplyId}
              targetReplyOffset={detail.targetReplyOffset}
            />
          </div>
        )}

        {detail.tab === "enrollment" &&
          (detail.enrollmentHistory.length > 0 ? (
            <CourseEnrollmentHistory
              enrollmentHistory={detail.enrollmentHistory}
            />
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              暂无选课人数记录。
            </div>
          ))}
      </div>
    </div>
  );
}
