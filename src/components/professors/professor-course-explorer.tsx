"use client";

import Link from "next/link";
import { SearchIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  searchProfessorReviewCourses,
  type ProfessorCourse,
  type ProfessorReviewCourseOption,
} from "@/lib/professor-actions";

const SUMMARY_LIMIT = 4;
const scoreFormat = new Intl.NumberFormat("zh-HK", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function ProfessorCourseExplorer({
  professor,
  courses,
  detailPath,
  initiallyOpen = false,
}: {
  professor: { publicId: string; name: string };
  courses: ProfessorCourse[];
  detailPath: string;
  initiallyOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState("");
  const [catalogCourses, setCatalogCourses] = useState<
    ProfessorReviewCourseOption[]
  >([]);
  const [searching, startSearch] = useTransition();
  const [searchError, setSearchError] = useState(false);
  const requestId = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  const orderedCourses = courses.toSorted(
    (left, right) =>
      Number(right.ratingCount > 0) - Number(left.ratingCount > 0) ||
      right.ratingCount - left.ratingCount ||
      left.code.localeCompare(right.code),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingCourses = normalizedQuery
    ? orderedCourses.filter((course) =>
        `${course.code} ${course.title}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : orderedCourses;
  const associatedCodes = new Set(courses.map((course) => course.code));
  const otherCourses = catalogCourses.filter(
    (course) => !associatedCodes.has(course.code),
  );

  function courseHref(code: string) {
    return `/courses/${encodeURIComponent(code)}?professor=${professor.publicId}&from=${encodeURIComponent(detailPath)}#peer-reviews`;
  }

  function reviewHref(code: string) {
    return `/courses/${encodeURIComponent(code)}?professor=${professor.publicId}&from=${encodeURIComponent(detailPath)}#course-review`;
  }

  useEffect(() => {
    const value = query.trim();
    const request = requestId.current;
    if (value.length < 2) return;
    const timer = window.setTimeout(() => {
      startSearch(async () => {
        try {
          const options = await searchProfessorReviewCourses(value);
          if (request === requestId.current) setCatalogCourses(options);
        } catch {
          if (request === requestId.current) {
            setCatalogCourses([]);
            setSearchError(true);
          }
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  function updateQuery(value: string) {
    requestId.current += 1;
    setQuery(value);
    setCatalogCourses([]);
    setSearchError(false);
  }

  function updateOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && initiallyOpen) {
      router.replace(detailPath, { scroll: false });
    }
  }

  return (
    <Dialog open={open} onOpenChange={updateOpen}>
      <section id="related-courses" className="mt-9 scroll-mt-20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">相关课程</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              课程关联来自目前收录的数据，可能不完整。
            </p>
          </div>
          <span className="shrink-0 pt-1 text-xs text-muted-foreground tabular-nums">
            目前收录 {courses.length} 门
          </span>
        </div>

        {orderedCourses.length ? (
          <ul className="mt-4 border-y divide-y">
            {orderedCourses.slice(0, SUMMARY_LIMIT).map((course, index) => (
              <CourseRow
                key={course.code}
                course={course}
                courseHref={courseHref(course.code)}
                reviewHref={reviewHref(course.code)}
                className={index === SUMMARY_LIMIT - 1 ? "hidden sm:grid" : ""}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-y py-5 text-sm text-muted-foreground">
            暂无已收录课程，仍可搜索全校课程并评价。
          </p>
        )}

        <DialogTrigger
          id="course-picker"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {courses.length
            ? `查看全部 ${courses.length} 门并搜索课程`
            : "搜索课程并评价"}
        </DialogTrigger>
      </section>

      <DialogContent
        initialFocus={closeRef}
        showCloseButton={false}
        className="top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-b-none rounded-t-xl p-0 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[min(70dvh,640px)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
      >
        <DialogClose
          ref={closeRef}
          aria-label="关闭课程选择"
          className="absolute top-2 right-2 z-10 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </DialogClose>
        <DialogHeader className="border-b p-5 pr-12">
          <DialogTitle>选择课程评价</DialogTitle>
          <DialogDescription>
            没有列出的课程也可以搜索并评价。
          </DialogDescription>
        </DialogHeader>

        <div className="border-b p-4 sm:px-5">
          <label className="sr-only" htmlFor="professor-course-picker-search">
            搜索课程代码或名称
          </label>
          <InputGroup className="h-11 rounded-lg bg-background">
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              id="professor-course-picker-search"
              type="search"
              name="course-query"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="输入课程代码或名称…"
            />
          </InputGroup>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
          {matchingCourses.length ? (
            <CourseResults
              title="目前收录"
              courses={matchingCourses}
              courseHref={courseHref}
              reviewHref={reviewHref}
            />
          ) : normalizedQuery ? (
            <p className="text-sm text-muted-foreground">
              目前收录的课程中没有匹配结果。
            </p>
          ) : null}

          <div
            aria-live="polite"
            className={matchingCourses.length ? "mt-6" : ""}
          >
            {query.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">
                输入至少 2 个字符以搜索其他课程。
              </p>
            ) : searching ? (
              <p className="text-xs text-muted-foreground">搜索中…</p>
            ) : searchError ? (
              <p className="text-xs text-destructive">
                暂时无法搜索，请稍后重试。
              </p>
            ) : otherCourses.length ? (
              <CourseResults
                title="其他课程"
                courses={otherCourses}
                reviewHref={reviewHref}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                没有找到其他课程，请检查课程代码。
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CourseRow({
  course,
  courseHref,
  reviewHref,
  className = "",
}: {
  course: ProfessorCourse;
  courseHref: string;
  reviewHref: string;
  className?: string;
}) {
  return (
    <li
      className={`grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 ${className}`}
    >
      <div className="min-w-0">
        <Link
          href={courseHref}
          className="block truncate rounded-sm font-medium hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            translate="no"
            className="mr-2 font-mono text-xs text-muted-foreground"
          >
            {course.code}
          </span>
          {course.title}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {course.ratingCount
            ? `${course.rating === null ? "-" : scoreFormat.format(course.rating)} / 5，${course.ratingCount} 份评价`
            : "暂无评价"}
        </p>
      </div>
      <Link
        href={reviewHref}
        prefetch={false}
        aria-label={`评价 ${course.code}`}
        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        评价
      </Link>
    </li>
  );
}

function CourseResults({
  title,
  courses,
  courseHref,
  reviewHref,
}: {
  title: string;
  courses: Array<ProfessorCourse | ProfessorReviewCourseOption>;
  courseHref?: (code: string) => string;
  reviewHref: (code: string) => string;
}) {
  return (
    <section aria-labelledby={`course-results-${title}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`course-results-${title}`} className="text-sm font-semibold">
          {title}
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {courses.length} 门
        </span>
      </div>
      <ul className="mt-2 divide-y border-y">
        {courses.map((course) => {
          const ratingCourse = "ratingCount" in course ? course : null;
          return (
            <li
              key={course.code}
              className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5"
            >
              <div className="min-w-0">
                {courseHref ? (
                  <Link
                    href={courseHref(course.code)}
                    className="block truncate rounded-sm font-medium hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      translate="no"
                      className="mr-2 font-mono text-xs text-muted-foreground"
                    >
                      {course.code}
                    </span>
                    {course.title}
                  </Link>
                ) : (
                  <p className="truncate font-medium">
                    <span
                      translate="no"
                      className="mr-2 font-mono text-xs text-muted-foreground"
                    >
                      {course.code}
                    </span>
                    {course.title}
                  </p>
                )}
                {ratingCourse ? (
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {ratingCourse.ratingCount
                      ? `${ratingCourse.rating === null ? "-" : scoreFormat.format(ratingCourse.rating)} / 5，${ratingCourse.ratingCount} 份评价`
                      : "暂无评价"}
                  </p>
                ) : null}
              </div>
              <Link
                href={reviewHref(course.code)}
                prefetch={false}
                aria-label={`评价 ${course.code}`}
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                评价
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
