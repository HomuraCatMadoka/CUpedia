"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CourseReviewCard } from "@/components/courses/course-review-card";
import { CourseReviewEditor } from "@/components/courses/course-review-editor";
import { cn } from "@/lib/utils";
import { COURSE_TERMS } from "@/lib/course-review-constants";
import type {
  CourseProfessorStats,
  CourseRatingState,
  CourseReviewView,
} from "@/lib/course-review-actions";

const INITIAL_REVIEW_LIMIT = 10;

export function CourseReviewSection({
  code,
  reviews,
  ratingState,
  professorStats,
  academicYears,
  isAuthenticated,
  professorOptional,
  prefillProfessor,
  targetReviewId,
  targetReplyId,
  targetReplyOffset,
}: {
  code: string;
  reviews: CourseReviewView[];
  ratingState: CourseRatingState;
  professorStats: CourseProfessorStats[];
  academicYears: string[];
  isAuthenticated: boolean;
  professorOptional: boolean;
  prefillProfessor?: CourseProfessorStats;
  targetReviewId?: string;
  targetReplyId?: string;
  targetReplyOffset?: number;
}) {
  const [selectedProfessorId, setSelectedProfessorId] = useState("");
  const [visibleReviewLimit, setVisibleReviewLimit] = useState(() => {
    const targetIndex = reviews.findIndex(
      (review) => review.id === targetReviewId,
    );
    return Math.max(INITIAL_REVIEW_LIMIT, targetIndex + 1);
  });
  const [showAllTermYears, setShowAllTermYears] = useState(false);
  useEffect(() => {
    if (!targetReviewId) return;
    document
      .getElementById(`course-review-${targetReviewId}`)
      ?.scrollIntoView?.({ block: "center" });
  }, [targetReviewId]);

  const activeProfessorId = targetReviewId ? "" : selectedProfessorId;
  const selectedProfessor = professorStats.find(
    (item) => item.id === activeProfessorId,
  );
  const visibleReviews = selectedProfessor
    ? reviews.filter((review) =>
        review.professors?.length
          ? review.professors.some(
              (professor) => professor.id === selectedProfessor.id,
            )
          : review.professorId === selectedProfessor.id,
      )
    : reviews;
  const visibleCommentCount = visibleReviews.length;
  const targetReviewIndex = visibleReviews.findIndex(
    (review) => review.id === targetReviewId,
  );
  const effectiveReviewLimit = Math.max(
    visibleReviewLimit,
    targetReviewIndex + 1,
  );
  const displayedReviews = visibleReviews.slice(0, effectiveReviewLimit);
  const hiddenReviewCount = visibleReviews.length - displayedReviews.length;
  const professorTermsByYear = selectedProfessor
    ? [
        ...new Set(selectedProfessor.terms.map((item) => item.academicYear)),
      ].map((academicYear) => ({
        academicYear,
        terms: new Map(
          selectedProfessor.terms
            .filter((item) => item.academicYear === academicYear)
            .map((item) => [item.term, item]),
        ),
      }))
    : [];
  const useTermCards = (selectedProfessor?.terms.length ?? 0) <= 4;
  const visibleProfessorTermsByYear = showAllTermYears
    ? professorTermsByYear
    : professorTermsByYear.slice(0, 4);
  const hiddenTermCount = professorTermsByYear
    .slice(4)
    .reduce((total, year) => total + year.terms.size, 0);
  return (
    <section id="course-review" className="scroll-mt-20 space-y-8">
      <CourseReviewEditor
        code={code}
        ratingState={ratingState}
        professorStats={professorStats}
        academicYears={academicYears}
        isAuthenticated={isAuthenticated}
        professorOptional={professorOptional}
        requiredProfessor={prefillProfessor}
      />

      <div id="peer-reviews" className="scroll-mt-20 space-y-4 border-b pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">同学测评</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedProfessor
                ? `${selectedProfessor.name} · ${visibleCommentCount} 条评论`
                : `${visibleCommentCount} 条评论`}
            </p>
          </div>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:w-64">
            任课教授
            <select
              aria-label="按任课教授筛选"
              value={activeProfessorId}
              onChange={(event) => {
                setSelectedProfessorId(event.target.value);
                setShowAllTermYears(false);
                setVisibleReviewLimit(INITIAL_REVIEW_LIMIT);
              }}
              disabled={professorStats.length === 0}
              className="h-9 w-full rounded-md border border-black/10 bg-background px-3 text-sm font-normal text-foreground outline-none transition-colors hover:border-black/20 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {professorStats.length ? "全部教授" : "暂无教授记录"}
              </option>
              {professorStats.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedProfessor && (
          <div
            data-testid="professor-rating-summary"
            className="grid overflow-hidden rounded-xl border border-black/10 bg-[#fbfbfa] sm:grid-cols-[168px_1fr] dark:bg-secondary/15"
          >
            <div className="flex items-end justify-between border-b border-black/10 px-4 py-4 sm:block sm:border-r sm:border-b-0 sm:p-5">
              <div>
                <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  Overall
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground sm:mt-2">
                  {selectedProfessor.ratingCount
                    ? `${selectedProfessor.ratingCount} 次评分`
                    : "暂无评分"}
                </p>
              </div>
              <p className="text-3xl font-light tracking-[-0.04em] tabular-nums sm:mt-2 sm:text-4xl">
                {selectedProfessor.rating?.toFixed(1) ?? "—"}
                <span className="ml-1 text-sm tracking-normal text-muted-foreground">
                  / 5
                </span>
              </p>
            </div>

            <div className="pb-4 sm:p-5">
              <p className="px-4 pt-4 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase sm:px-0 sm:pt-0">
                任教学期
              </p>
              {selectedProfessor.terms.length ? (
                useTermCards ? (
                  <div
                    className={cn(
                      "mt-3 grid gap-2 px-4 sm:px-0",
                      selectedProfessor.terms.length === 1 && "sm:max-w-56",
                      selectedProfessor.terms.length === 2 && "grid-cols-2",
                      selectedProfessor.terms.length === 3 &&
                        "grid-cols-2 sm:grid-cols-3",
                      selectedProfessor.terms.length === 4 &&
                        "grid-cols-2 lg:grid-cols-4",
                    )}
                  >
                    {selectedProfessor.terms.map((item) => (
                      <div
                        key={`${item.academicYear}-${item.term}`}
                        className="min-w-0 rounded-lg border border-black/10 bg-background px-3 py-3"
                      >
                        <p className="truncate text-[11px] font-medium text-muted-foreground tabular-nums">
                          {item.academicYear}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.term}
                        </p>
                        {item.rating === null ? (
                          <div className="mt-3">
                            <p className="text-sm font-medium">未评分</p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              有任教记录
                            </p>
                          </div>
                        ) : (
                          <div className="mt-2 flex items-baseline gap-1.5">
                            <span className="text-xl font-medium tracking-[-0.03em] tabular-nums">
                              {item.rating.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {item.ratingCount} 次评分
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 sm:mt-3">
                    <div className="grid grid-cols-[72px_repeat(3,minmax(0,1fr))] items-center px-4 py-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase sm:px-0">
                      <span>学年</span>
                      {COURSE_TERMS.map((term) => (
                        <span key={term} className="text-center">
                          {term}
                        </span>
                      ))}
                    </div>
                    <div className="divide-y divide-black/10 border-y border-black/10">
                      {visibleProfessorTermsByYear.map(
                        ({ academicYear, terms }) => (
                          <div
                            key={academicYear}
                            className="grid grid-cols-[72px_repeat(3,minmax(0,1fr))] items-center px-4 py-2.5 sm:px-0"
                          >
                            <span className="text-xs font-medium text-muted-foreground tabular-nums">
                              {academicYear}
                            </span>
                            {COURSE_TERMS.map((term) => {
                              const item = terms.get(term);
                              if (!item) {
                                return (
                                  <div
                                    key={term}
                                    className="text-center text-base text-muted-foreground/35"
                                    title="该学期没有任教记录"
                                  >
                                    —
                                  </div>
                                );
                              }
                              return (
                                <div key={term} className="text-center">
                                  {item.rating === null ? (
                                    <p className="text-[11px] font-medium text-muted-foreground">
                                      未评分
                                    </p>
                                  ) : (
                                    <>
                                      <p className="text-base font-medium tracking-tight tabular-nums">
                                        {item.rating.toFixed(1)}
                                      </p>
                                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                                        {item.ratingCount} 次
                                      </p>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ),
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-0">
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        — 表示该学期未任教；“未评分”表示有任教记录。
                      </p>
                      {professorTermsByYear.length > 4 && (
                        <button
                          type="button"
                          onClick={() =>
                            setShowAllTermYears((current) => !current)
                          }
                          className="shrink-0 text-xs font-medium underline decoration-black/20 underline-offset-4 hover:decoration-black/60"
                        >
                          {showAllTermYears
                            ? "收起旧记录"
                            : `再看 ${hiddenTermCount} 个学期`}
                        </button>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <p className="px-4 py-4 text-sm text-muted-foreground sm:px-0 sm:pb-0">
                  暂无任教学期记录
                </p>
              )}
            </div>
            {selectedProfessor.tags.length > 0 && (
              <div
                aria-label="教授课程体验标签"
                className="flex flex-wrap gap-2 border-t border-black/10 px-4 py-4 sm:col-span-2 sm:px-5"
              >
                {selectedProfessor.tags.map((tag) => (
                  <span
                    key={tag.label}
                    className="rounded-full bg-secondary px-3 py-1.5 text-xs"
                  >
                    {tag.label} {tag.count}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ul className="space-y-3">
        {visibleReviews.length === 0 && (
          <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {selectedProfessor
              ? "该教授还没有文字测评。"
              : "还没有文字测评。你也可以只提交评分。"}
          </li>
        )}
        {displayedReviews.map((review) => (
          <CourseReviewCard
            key={review.id}
            code={code}
            review={review}
            isAuthenticated={isAuthenticated}
            targetReplyId={
              review.id === targetReviewId ? targetReplyId : undefined
            }
            targetReplyOffset={
              review.id === targetReviewId ? targetReplyOffset : undefined
            }
          />
        ))}
      </ul>

      {hiddenReviewCount > 0 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() =>
              setVisibleReviewLimit((current) =>
                Math.min(current + INITIAL_REVIEW_LIMIT, visibleReviews.length),
              )
            }
          >
            再看 {Math.min(INITIAL_REVIEW_LIMIT, hiddenReviewCount)} 条测评
          </Button>
        </div>
      )}
    </section>
  );
}
