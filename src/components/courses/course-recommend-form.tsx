"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDownIcon, PencilIcon, XIcon } from "lucide-react";

import { CourseReviewCard } from "@/components/courses/course-review-card";
import { CourseReviewEditor } from "@/components/courses/course-review-editor";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatCourseCode } from "@/app/(main)/courses/course-types";
import { cn } from "@/lib/utils";
import {
  getCourse,
  getCourseRatingState,
  getCourseProfessorStats,
  getCourseReviews,
  isCourseProfessorOptional,
  type CourseProfessorStats,
  type CourseRatingState,
  type CourseReviewView,
  type RecommendedCourseItem,
} from "@/lib/course-review-actions";
import {
  searchProfessorReviewCourses,
  type ProfessorReviewCourseOption,
} from "@/lib/professor-actions";

type SelectedCourse = ProfessorReviewCourseOption;

type LoadedCourseState = {
  ratingState: CourseRatingState;
  professorStats: CourseProfessorStats[];
  professorOptional: boolean;
};

export function CourseRecommendForm({
  academicYears,
  isAuthenticated,
  initialCode,
  initialRecommends,
}: {
  academicYears: string[];
  isAuthenticated: boolean;
  initialCode?: string;
  initialRecommends: RecommendedCourseItem[];
}) {
  const router = useRouter();
  const [courseQuery, setCourseQuery] = useState("");
  const [courseOptions, setCourseOptions] = useState<
    ProfessorReviewCourseOption[]
  >([]);
  const [selectedCourse, setSelectedCourse] = useState<SelectedCourse | null>(
    null,
  );
  const [courseState, setCourseState] = useState<LoadedCourseState | null>(
    null,
  );
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [reviewsByCode, setReviewsByCode] = useState<
    Record<string, CourseReviewView[]>
  >({});
  const [loadError, setLoadError] = useState("");
  const [searching, startSearch] = useTransition();
  const [loadingCourse, startLoadCourse] = useTransition();
  const [loadingReviews, startLoadReviews] = useTransition();
  const [refreshingReviews, startRefreshReviews] = useTransition();
  const pendingEditorScroll = useRef(false);
  const searchRequest = useRef(0);
  const loadRequest = useRef(0);
  const reviewRequest = useRef(0);
  const initialHydrated = useRef(false);

  function handleCourseQuery(value: string) {
    const request = ++searchRequest.current;
    setCourseQuery(value);
    if (value.trim().length < 2) {
      setCourseOptions([]);
      return;
    }
    setCourseOptions([]);
    startSearch(async () => {
      try {
        const options = await searchProfessorReviewCourses(value);
        if (request === searchRequest.current) setCourseOptions(options);
      } catch {
        if (request === searchRequest.current) setCourseOptions([]);
      }
    });
  }

  function loadCourse(course: SelectedCourse) {
    if (!isAuthenticated) return;
    const request = ++loadRequest.current;
    setSelectedCourse(course);
    setCourseState(null);
    setLoadError("");
    searchRequest.current += 1;
    setCourseQuery("");
    setCourseOptions([]);
    startLoadCourse(async () => {
      try {
        const [ratingState, professorStats, professorOptional] =
          await Promise.all([
            getCourseRatingState(course.code),
            getCourseProfessorStats(course.code).catch(() => []),
            isCourseProfessorOptional(course.code).catch(() => true),
          ]);
        if (request !== loadRequest.current) return;
        if (!ratingState) {
          setSelectedCourse(null);
          setLoadError("未找到该课程，请重新选择");
          return;
        }
        setCourseState({
          ratingState,
          professorStats,
          professorOptional,
        });
      } catch {
        if (request !== loadRequest.current) return;
        setSelectedCourse(null);
        setCourseState(null);
        setLoadError("加载课程失败，请重试");
      }
    });
  }

  function clearCourse() {
    loadRequest.current += 1;
    setSelectedCourse(null);
    setCourseState(null);
    setLoadError("");
    setCourseQuery("");
    setCourseOptions([]);
  }

  function refreshExpandedReviews() {
    if (!expandedCode) return;
    const code = expandedCode;
    startRefreshReviews(async () => {
      try {
        const reviews = await getCourseReviews(code);
        setReviewsByCode((current) => ({
          ...current,
          [code]: reviews,
        }));
      } catch {
        // Keep the current reviews if refresh fails.
      }
    });
  }

  function toggleCourseReviews(item: RecommendedCourseItem) {
    if (expandedCode === item.code) {
      setExpandedCode(null);
      return;
    }
    setExpandedCode(item.code);
    if (reviewsByCode[item.code]) return;
    const request = ++reviewRequest.current;
    startLoadReviews(async () => {
      try {
        const reviews = await getCourseReviews(item.code);
        if (request !== reviewRequest.current) return;
        setReviewsByCode((current) => ({
          ...current,
          [item.code]: reviews,
        }));
      } catch {
        if (request !== reviewRequest.current) return;
        setReviewsByCode((current) => ({
          ...current,
          [item.code]: [],
        }));
      }
    });
  }

  function startWritingReview(item: RecommendedCourseItem) {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    pendingEditorScroll.current = true;
    loadCourse({ code: item.code, title: item.title });
  }

  useEffect(() => {
    if (!pendingEditorScroll.current || !selectedCourse || !courseState) return;
    pendingEditorScroll.current = false;
    document
      .getElementById("course-recommend-editor")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedCourse, courseState]);

  useEffect(() => {
    if (!initialCode || initialHydrated.current || !isAuthenticated) return;
    initialHydrated.current = true;
    const code = initialCode.trim();
    if (!code) return;

    let cancelled = false;
    void (async () => {
      try {
        const course = await getCourse(code);
        if (cancelled) return;
        if (course) {
          loadCourse({ code: course.code, title: course.title });
          return;
        }
        setLoadError("无法预选课程，请手动搜索");
      } catch {
        if (!cancelled) setLoadError("无法预选课程，请手动搜索");
      }
    })();

    return () => {
      cancelled = true;
    };
    // Hydrate once from the URL; loadCourse closes over fresh transition helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, isAuthenticated]);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-secondary/25 px-6 py-5">
          <h2 className="text-lg font-semibold">选择课程</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            选择课程后即可填写测评
          </p>
        </div>
        <div className="space-y-4 p-6">
          {!isAuthenticated ? (
            <div className="rounded-xl border bg-secondary/40 p-4 text-sm text-muted-foreground">
              请先{" "}
              <Link
                href="/login"
                className="font-medium text-foreground underline"
              >
                登录
              </Link>{" "}
              后选择课程并填写推荐。
            </div>
          ) : selectedCourse ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex max-w-full items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                <span className="font-medium tabular-nums">
                  {formatCourseCode(selectedCourse.code)}
                </span>
                <span className="min-w-0 break-words text-muted-foreground">
                  {selectedCourse.title}
                </span>
              </span>
              <button
                type="button"
                onClick={clearCourse}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label="清除已选课程"
              >
                <XIcon aria-hidden="true" className="size-3.5" />
                更换
              </button>
            </div>
          ) : (
            <Command
              shouldFilter={false}
              className="relative overflow-visible rounded-lg border bg-background p-0"
            >
              <CommandInput
                aria-label="搜索课程"
                name="course-search"
                value={courseQuery}
                onValueChange={handleCourseQuery}
                placeholder="输入课程代码或名称…"
                autoComplete="off"
                spellCheck={false}
                className="h-9"
              />
              {courseQuery.trim().length >= 2 ? (
                <CommandList className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-20 max-h-56 rounded-md border bg-popover p-1 shadow-md">
                  <CommandEmpty>
                    {searching ? "搜索中…" : "没有匹配的课程"}
                  </CommandEmpty>
                  {courseOptions.map((option) => (
                    <CommandItem
                      key={option.code}
                      value={`${option.code} ${option.title}`}
                      onSelect={() => loadCourse(option)}
                      className="block px-2 py-1.5 [&>svg:last-child]:hidden"
                    >
                      <span className="block font-medium tabular-nums">
                        {formatCourseCode(option.code)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.title}
                      </span>
                    </CommandItem>
                  ))}
                </CommandList>
              ) : courseQuery.trim().length === 1 ? (
                <p className="px-3 pb-3 text-xs text-muted-foreground">
                  请再输入至少一个字符
                </p>
              ) : null}
            </Command>
          )}

          {loadingCourse && (
            <p className="text-sm text-muted-foreground">正在加载课程…</p>
          )}
          {loadError && (
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
          )}

          {!selectedCourse ? (
            <div className="border-t pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">推荐课程</p>
                {refreshingReviews && (
                  <span className="text-xs text-muted-foreground">更新中…</span>
                )}
              </div>
              {initialRecommends.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  还没有推荐，提交测评后会出现在这里
                </p>
              ) : (
                <ul className="divide-y border-y">
                  {initialRecommends.map((item) => {
                    const expanded = expandedCode === item.code;
                    const reviews = reviewsByCode[item.code];
                    return (
                      <li key={item.code} className="text-sm">
                        <button
                          type="button"
                          onClick={() => toggleCourseReviews(item)}
                          aria-expanded={expanded}
                          className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-secondary/40"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-medium tabular-nums">
                              {formatCourseCode(item.code)}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              {item.title}
                            </span>
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {item.ratingCount} 条
                          </span>
                          <ChevronDownIcon
                            aria-hidden="true"
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground transition-transform",
                              expanded && "rotate-180",
                            )}
                          />
                        </button>
                        {expanded ? (
                          <div className="border-t bg-secondary/15 px-1 py-3 sm:px-2">
                            <div className="mb-3 flex justify-end px-1">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => startWritingReview(item)}
                              >
                                <PencilIcon className="size-3.5" />
                                写评价
                              </Button>
                            </div>
                            {reviews === undefined ||
                            (loadingReviews && !reviews) ? (
                              <p className="px-2 py-2 text-xs text-muted-foreground">
                                加载评价中…
                              </p>
                            ) : reviews.length === 0 ? (
                              <p className="px-2 py-2 text-xs text-muted-foreground">
                                暂无文字评价
                              </p>
                            ) : (
                              <ul className="space-y-3">
                                {reviews.map((review) => (
                                  <CourseReviewCard
                                    key={review.id}
                                    code={item.code}
                                    review={review}
                                    isAuthenticated={isAuthenticated}
                                    hideAvatar
                                  />
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {isAuthenticated && selectedCourse && courseState ? (
        <div id="course-recommend-editor" className="scroll-mt-20">
          <CourseReviewEditor
            key={`${selectedCourse.code}-${courseState.ratingState.myRatingCount}-${courseState.ratingState.ratingCount}`}
            code={selectedCourse.code}
            ratingState={courseState.ratingState}
            professorStats={courseState.professorStats}
            academicYears={[
              ...new Set([
                ...(courseState.ratingState.lastAcademicYear
                  ? [courseState.ratingState.lastAcademicYear]
                  : []),
                ...academicYears,
              ]),
            ]
              .sort()
              .reverse()}
            isAuthenticated={isAuthenticated}
            professorOptional={courseState.professorOptional}
            defaultEditing
            onSubmitted={refreshExpandedReviews}
          />
        </div>
      ) : null}
    </div>
  );
}
