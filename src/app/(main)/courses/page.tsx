export const dynamic = "force-dynamic";

import Link from "next/link";
import { BookOpenIcon, MessageSquareTextIcon, StarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CourseFilters } from "@/components/courses/course-filters";
import { CourseSearch } from "@/components/courses/course-search";
import { getCourseSummaries } from "@/lib/course-actions";
import {
  formatCourseCode,
  formatCourseMetric,
  getCourseSubject,
} from "@/lib/course-format";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; department?: string; credits?: string }>;
}) {
  const { q, department, credits } = await searchParams;
  const [courses, allCourses] = await Promise.all([
    getCourseSummaries({ query: q, department, credits }),
    getCourseSummaries(),
  ]);

  const departments = Array.from(
    new Set(
      allCourses
        .map((course) => course.department)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Course Reviews</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse ratings, difficulty, workload, and student feedback.
            </p>
          </div>
          <Badge variant="secondary">{courses.length} courses</Badge>
        </div>

        <div className="mt-7 flex flex-col gap-8 lg:flex-row">
          <CourseFilters
            credits={credits}
            departments={departments}
            department={department}
          />

          <section className="min-w-0 flex-1 space-y-5">
            <CourseSearch initialQuery={q ?? ""} />

            {courses.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                No courses found.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {courses.map((course) => (
                  <Link
                    key={course.id}
                    href={`/courses/${course.code}`}
                    prefetch={false}
                    className="group rounded-lg border p-4 transition-colors hover:border-foreground/40 hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {getCourseSubject(course.code)}
                          </Badge>
                          {course.department && (
                            <span className="text-xs text-muted-foreground">
                              {course.department}
                            </span>
                          )}
                        </div>
                        <h2 className="mt-3 text-lg font-semibold">
                          {formatCourseCode(course.code)}
                        </h2>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {course.title}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-2xl font-semibold tabular-nums">
                          {formatCourseMetric(course.averageRating)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Overall /5
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <BookOpenIcon className="size-3.5" />
                        {course.credits ?? "N/A"} units
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquareTextIcon className="size-3.5" />
                        {course.reviewCount} reviews
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <StarIcon className="size-3.5" />
                        Diff {formatCourseMetric(course.averageDifficulty)}
                      </span>
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
