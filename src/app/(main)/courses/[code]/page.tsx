export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  GaugeIcon,
  GraduationCapIcon,
  MessageSquareTextIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CourseReviewForm } from "@/components/courses/course-review-form";
import {
  CourseReviewList,
  type CourseReviewListItem,
} from "@/components/courses/course-review-list";
import { getCourseDetail } from "@/lib/course-actions";
import { getOptionalUser } from "@/lib/auth-guard";
import { formatCourseCode, formatCourseMetric } from "@/lib/course-format";

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [detailResult, user] = await Promise.allSettled([
    getCourseDetail(decodeURIComponent(code)),
    getOptionalUser(),
  ]);

  if (detailResult.status === "rejected") {
    if (
      detailResult.reason instanceof Error &&
      detailResult.reason.message === "Course not found"
    ) {
      notFound();
    }
    throw detailResult.reason;
  }

  const detail = detailResult.value;
  const reviews: CourseReviewListItem[] = detail.reviews.map((review) => ({
    ...review,
    createdAt: review.createdAt.toISOString(),
  }));
  const isAuthenticated = user.status === "fulfilled" && Boolean(user.value);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to courses
        </Link>

        <section className="mt-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {detail.course.department && (
                  <Badge variant="outline">{detail.course.department}</Badge>
                )}
                <Badge variant="secondary">
                  {detail.course.credits ?? "N/A"} units
                </Badge>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-normal">
                {formatCourseCode(detail.course.code)}
              </h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                {detail.course.title}
              </p>
            </div>
            <div className="rounded-lg border px-5 py-4 text-right">
              <div className="text-xs text-muted-foreground">Overall</div>
              <div className="mt-1 text-4xl font-semibold tabular-nums">
                {formatCourseMetric(detail.aggregate.averageRating)}
              </div>
              <div className="text-xs text-muted-foreground">
                {detail.aggregate.reviewCount} reviews
              </div>
            </div>
          </div>

          {detail.course.description && (
            <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">
              {detail.course.description}
            </p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Overall"
              value={formatCourseMetric(detail.aggregate.averageRating)}
              icon={GraduationCapIcon}
            />
            <Stat
              label="Difficulty"
              value={formatCourseMetric(detail.aggregate.averageDifficulty)}
              icon={GaugeIcon}
            />
            <Stat
              label="Workload"
              value={formatCourseMetric(detail.aggregate.averageWorkload)}
              icon={BookOpenIcon}
            />
            <Stat
              label="Grading"
              value={formatCourseMetric(detail.aggregate.averageGrading)}
              icon={MessageSquareTextIcon}
            />
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <CourseReviewList
            reviews={reviews}
            isAuthenticated={isAuthenticated}
          />
          <div className="lg:sticky lg:top-20 lg:self-start">
            <CourseReviewForm
              courseCode={detail.course.code}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
