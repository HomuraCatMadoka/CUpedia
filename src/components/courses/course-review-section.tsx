"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { CourseReviewCard } from "@/components/courses/course-review-card";
import { CourseReviewEditor } from "@/components/courses/course-review-editor";
import {
  formatProfessorName,
  formatProfessorNameText,
} from "@/lib/professor-name-format";
import { cn } from "@/lib/utils";
import {
  COURSE_REVIEW_PAGE_SIZE,
  COURSE_REVIEW_REFRESH_BATCH_SIZE,
  COURSE_TERMS,
} from "@/lib/course-review-constants";
import {
  getCourseReviewPage,
  type CourseProfessorStats,
  type CourseRatingState,
  type CourseReviewPage,
  type CourseReviewView,
  type ProfessorOption,
} from "@/lib/course-review-actions";

type ReviewRequest =
  | { professorId: string; cursor?: string }
  | { professorId: string; visibleCount: number };

type ReviewListing = {
  sourcePage: CourseReviewPage;
  professorId: string;
  page: CourseReviewPage;
  request?: ReviewRequest;
  failedRequest?: ReviewRequest;
};

function appendReviewPages(first: CourseReviewPage, next: CourseReviewPage) {
  const visibleIds = new Set(first.items.map((review) => review.id));
  return {
    ...next,
    items: [
      ...first.items,
      ...next.items.filter((review) => !visibleIds.has(review.id)),
    ],
  };
}

export function CourseReviewSection({
  code,
  reviewPage,
  reviewedProfessors,
  initialProfessorId,
  ratingState,
  professorStats,
  academicYears,
  isAuthenticated,
  viewerKey,
  professorOptional,
  prefillProfessor,
  targetReview,
  targetReviewId,
  targetReplyId,
  targetReplyOffset,
}: {
  code: string;
  reviewPage: CourseReviewPage;
  reviewedProfessors: Pick<ProfessorOption, "id" | "name">[];
  initialProfessorId: string;
  ratingState: CourseRatingState;
  professorStats: CourseProfessorStats[];
  academicYears: string[];
  isAuthenticated: boolean;
  viewerKey?: string;
  professorOptional: boolean;
  prefillProfessor?: ProfessorOption;
  targetReview?: CourseReviewView;
  targetReviewId?: string;
  targetReplyId?: string;
  targetReplyOffset?: number;
}) {
  const [listing, setListing] = useState<ReviewListing | null>(null);
  const [showAllTermYears, setShowAllTermYears] = useState(false);
  const { refresh } = useRouter();
  const page = listing?.page ?? reviewPage;
  const activeProfessorId = listing?.professorId ?? initialProfessorId;
  const pending = listing?.request;
  const failedRequest = listing?.failedRequest;

  useEffect(() => {
    if (page.viewerChanged) refresh();
  }, [page.viewerChanged, refresh]);

  useEffect(() => {
    if (!targetReviewId) return;
    document
      .getElementById(`course-review-${targetReviewId}`)
      ?.scrollIntoView?.({ block: "center" });
  }, [targetReviewId]);

  async function requestReviews(professorId: string, cursor?: string) {
    const request = { professorId, cursor };
    setListing({
      sourcePage: reviewPage,
      professorId: activeProfessorId,
      page,
      request,
    });

    try {
      const result = await getCourseReviewPage(code, {
        professorId: professorId || undefined,
        cursor,
        ...(viewerKey !== undefined ? { viewerKey } : {}),
      });
      const nextPage =
        cursor && !result.viewerChanged
          ? appendReviewPages(page, result)
          : result;
      setListing((current) =>
        current?.request === request
          ? { sourcePage: reviewPage, professorId, page: nextPage }
          : current,
      );
    } catch {
      setListing((current) =>
        current?.request === request
          ? { ...current, request: undefined, failedRequest: request }
          : current,
      );
    }
  }

  const evaluatedProfessorIds = new Set(
    reviewedProfessors.map((professor) => professor.id),
  );
  const filterProfessors = new Map<string, CourseProfessorStats>();
  for (const professor of professorStats) {
    if (professor.ratingCount > 0) evaluatedProfessorIds.add(professor.id);
    if (evaluatedProfessorIds.has(professor.id)) {
      filterProfessors.set(professor.id, professor);
    }
  }
  for (const professor of [
    ...reviewedProfessors,
    ...(prefillProfessor ? [prefillProfessor] : []),
  ]) {
    if (filterProfessors.has(professor.id)) continue;
    filterProfessors.set(
      professor.id,
      professorStats.find((item) => item.id === professor.id) ?? {
        ...professor,
        rating: null,
        ratingCount: 0,
        terms: [],
        tags: [],
      },
    );
  }

  // Retire in-flight reads as soon as the route supplies a fresh first page.
  // Keep the current cards mounted while reloading any client-expanded range.
  if (listing && listing.sourcePage !== reviewPage) {
    const previousRequest = pending ?? failedRequest;
    const intendedProfessorId =
      previousRequest?.professorId ?? activeProfessorId;
    const professorId =
      !intendedProfessorId || filterProfessors.has(intendedProfessorId)
        ? intendedProfessorId
        : initialProfessorId;
    const visibleCount = Math.max(
      COURSE_REVIEW_PAGE_SIZE,
      professorId === activeProfessorId ? page.items.length : 0,
      previousRequest &&
        "visibleCount" in previousRequest &&
        previousRequest.professorId === professorId
        ? previousRequest.visibleCount
        : 0,
    );
    const useFirstPage =
      professorId === initialProfessorId &&
      (!reviewPage.nextCursor || reviewPage.items.length >= visibleCount);
    setListing(
      page.viewerChanged || useFirstPage
        ? null
        : {
            sourcePage: reviewPage,
            professorId: activeProfessorId,
            page,
            request: { professorId, visibleCount },
          },
    );
  }

  useEffect(() => {
    if (!pending || !("visibleCount" in pending)) return;
    const request = pending;
    const { professorId, visibleCount } = request;
    const options = {
      professorId: professorId || undefined,
      ...(viewerKey !== undefined ? { viewerKey } : {}),
    };
    let cancelled = false;

    async function reloadListing() {
      try {
        let refreshed =
          professorId === initialProfessorId
            ? reviewPage
            : await getCourseReviewPage(code, {
                ...options,
                limit: Math.min(visibleCount, COURSE_REVIEW_REFRESH_BATCH_SIZE),
              });
        while (
          !cancelled &&
          !refreshed.viewerChanged &&
          refreshed.nextCursor &&
          refreshed.items.length < visibleCount
        ) {
          const more = await getCourseReviewPage(code, {
            ...options,
            cursor: refreshed.nextCursor,
            limit: Math.min(
              visibleCount - refreshed.items.length,
              COURSE_REVIEW_REFRESH_BATCH_SIZE,
            ),
          });
          refreshed = more.viewerChanged
            ? more
            : appendReviewPages(refreshed, more);
        }
        if (cancelled) return;
        setListing((current) =>
          current?.request === request
            ? { sourcePage: reviewPage, professorId, page: refreshed }
            : current,
        );
      } catch {
        if (cancelled) return;
        setListing((current) =>
          current?.request === request
            ? {
                sourcePage: reviewPage,
                professorId,
                page:
                  professorId === initialProfessorId
                    ? reviewPage
                    : { items: [], totalCount: 0, nextCursor: null },
                failedRequest: request,
              }
            : current,
        );
      }
    }

    queueMicrotask(() => {
      if (!cancelled) void reloadListing();
    });
    return () => {
      cancelled = true;
    };
  }, [code, initialProfessorId, pending, reviewPage, viewerKey]);

  function retryReviews(request: ReviewRequest) {
    if ("visibleCount" in request) {
      setListing(
        (current) =>
          current && {
            ...current,
            request: { ...request },
            failedRequest: undefined,
          },
      );
    } else {
      void requestReviews(request.professorId, request.cursor);
    }
  }

  const prefillHasEvaluation =
    prefillProfessor && evaluatedProfessorIds.has(prefillProfessor.id);
  const selectedProfessor = filterProfessors.get(activeProfessorId);
  const displayedReviews =
    !activeProfessorId &&
    targetReview &&
    !page.items.some((review) => review.id === targetReview.id)
      ? [targetReview, ...page.items]
      : page.items;
  const { nextCursor, totalCount: visibleCommentCount } = page;
  const hiddenReviewCount = visibleCommentCount - displayedReviews.length;
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

  if (page.viewerChanged) {
    return <p role="status">正在刷新登录状态…</p>;
  }

  return (
    <section id="course-review" className="scroll-mt-20 space-y-8">
      <CourseReviewEditor
        key={`${ratingState.ratingCount}-${ratingState.myRatingCount}`}
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
              {selectedProfessor ? (
                <>
                  {formatProfessorName(selectedProfessor.name)} ·{" "}
                  {visibleCommentCount} 条评论
                </>
              ) : (
                `${visibleCommentCount} 条评论`
              )}
            </p>
          </div>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:w-64">
            任课教授
            <select
              aria-label="按任课教授筛选"
              value={pending?.professorId ?? activeProfessorId}
              onChange={(event) => {
                setShowAllTermYears(false);
                const professorId = event.target.value;
                if (professorId === initialProfessorId) {
                  setListing(null);
                  return;
                }
                void requestReviews(professorId);
              }}
              disabled={filterProfessors.size === 0}
              className="h-9 w-full rounded-md border border-black/10 bg-background px-3 text-sm font-normal text-foreground outline-none transition-colors hover:border-black/20 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {filterProfessors.size ? "全部教授" : "暂无教授评价"}
              </option>
              {Array.from(filterProfessors.values(), (item) => (
                <option key={item.id} value={item.id}>
                  {formatProfessorNameText(item.name)}
                  {item.id === prefillProfessor?.id && !prefillHasEvaluation
                    ? "（暂无评价）"
                    : ""}
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

      {failedRequest && (
        <div className="flex items-center gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            评论加载失败，请重试。
          </p>
          <Button variant="ghost" onClick={() => retryReviews(failedRequest)}>
            重试
          </Button>
        </div>
      )}

      <ul className="space-y-3" aria-busy={Boolean(pending)}>
        {displayedReviews.length === 0 && !failedRequest && (
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

      {nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={Boolean(pending)}
            onClick={() => void requestReviews(activeProfessorId, nextCursor)}
          >
            {hiddenReviewCount > 0
              ? `再看 ${Math.min(COURSE_REVIEW_PAGE_SIZE, hiddenReviewCount)} 条测评`
              : "加载更多测评"}
          </Button>
        </div>
      )}
    </section>
  );
}
