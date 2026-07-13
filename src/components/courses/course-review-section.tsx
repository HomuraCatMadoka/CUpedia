"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StarIcon, ThumbsUpIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { COURSE_TERMS, type CourseTerm } from "@/lib/course-review-constants";
import {
  deleteReview,
  searchProfessors,
  submitCourseReview,
  toggleLike,
  type CourseRatingState,
  type CourseReviewView,
  type ProfessorOption,
} from "@/lib/course-review-actions";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

function StarGlyph({ value, position }: { value: number; position: number }) {
  const fill = value >= position ? 100 : value >= position - 0.5 ? 50 : 0;
  return (
    <span className="relative block size-8" aria-hidden="true">
      <StarIcon className="absolute inset-0 size-8 text-border" />
      {fill > 0 && (
        <span
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${fill}%` }}
        >
          <StarIcon className="size-8 max-w-none fill-amber-400 text-amber-500" />
        </span>
      )}
    </span>
  );
}

function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (score: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex" role="radiogroup" aria-label="总体评分">
        {Array.from({ length: 5 }, (_, index) => {
          const position = index + 1;
          return (
            <span key={position} className="relative">
              <StarGlyph value={value ?? 0} position={position} />
              {[position - 0.5, position].map((score, half) => (
                <button
                  key={score}
                  type="button"
                  role="radio"
                  aria-label={`${score} 星`}
                  aria-checked={value === score}
                  disabled={disabled}
                  onClick={() => onChange(score)}
                  className={cn(
                    "absolute inset-y-0 z-10 w-1/2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    half === 0 ? "left-0" : "right-0",
                    disabled ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                />
              ))}
            </span>
          );
        })}
      </div>
      <span className="min-w-14 text-sm font-medium tabular-nums">
        {value === null ? "未选择" : `${value.toFixed(1)} 星`}
      </span>
    </div>
  );
}

export function CourseReviewSection({
  code,
  reviews,
  ratingState,
  academicYears,
  isAuthenticated,
}: {
  code: string;
  reviews: CourseReviewView[];
  ratingState: CourseRatingState;
  academicYears: string[];
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [academicYear, setAcademicYear] = useState(
    ratingState.lastAcademicYear ?? "",
  );
  const [term, setTerm] = useState<CourseTerm | "">(ratingState.lastTerm ?? "");
  const [score, setScore] = useState<number | null>(ratingState.lastScore);
  const [error, setError] = useState("");
  const [submitting, startSubmit] = useTransition();
  const [, startSearch] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [professorQuery, setProfessorQuery] = useState(
    ratingState.lastProfessor?.name ?? "",
  );
  const [professorOptions, setProfessorOptions] = useState<ProfessorOption[]>(
    [],
  );
  const [professor, setProfessor] = useState<ProfessorOption | null>(
    ratingState.lastProfessor,
  );

  function handleProfessorQuery(value: string) {
    setProfessorQuery(value);
    setProfessor(null);
    startSearch(async () =>
      setProfessorOptions(await searchProfessors(code, value)),
    );
  }

  function handleSubmit() {
    setError("");
    startSubmit(async () => {
      try {
        if (!academicYear) throw new Error("请选择学年");
        if (!term) throw new Error("请选择学期");
        if (!professor) throw new Error("请选择任课教授");
        if (score === null) throw new Error("请选择总体评分");
        await submitCourseReview(code, {
          academicYear,
          term,
          professorId: professor.id,
          score,
          content,
        });
        setContent("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "提交失败");
      }
    });
  }

  function handleLike(id: string) {
    setBusyId(id);
    startSubmit(async () => {
      try {
        await toggleLike(id);
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  function handleDelete(id: string) {
    setBusyId(id);
    startSubmit(async () => {
      try {
        await deleteReview(id);
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  const ready = !!academicYear && !!term && !!professor && score !== null;
  const isUpdating = ratingState.lastScore !== null;

  return (
    <section className="space-y-8">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-secondary/25 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold">
              {isUpdating ? "更新课程测评" : "提交课程测评"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isUpdating
                ? "已载入你上次的开课信息；修改后会更新评分，填写评论则新增一条匿名评论。"
                : "记录你实际修读的学期；评论选填，投稿始终匿名。"}
            </p>
          </div>
        </div>

        {!isAuthenticated ? (
          <div className="m-6 rounded-xl border bg-secondary/40 p-4 text-sm text-muted-foreground">
            请先{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline"
            >
              登录
            </Link>{" "}
            后提交测评或点赞。
          </div>
        ) : (
          <div className="space-y-6 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                <span>学年</span>
                <select
                  aria-label="学年"
                  value={academicYear}
                  onChange={(event) => setAcademicYear(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="" disabled>
                    选择学年
                  </option>
                  {academicYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>学期</span>
                <select
                  aria-label="学期"
                  value={term}
                  onChange={(event) =>
                    setTerm(event.target.value as CourseTerm)
                  }
                  className="h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="" disabled>
                    选择学期
                  </option>
                  {COURSE_TERMS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium">
              <span>任课教授</span>
              <div className="relative">
                <input
                  value={professorQuery}
                  onChange={(event) => handleProfessorQuery(event.target.value)}
                  placeholder="搜索任课教授姓名"
                  autoComplete="off"
                  className="h-10 w-full rounded-md border bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {!professor &&
                  professorQuery &&
                  professorOptions.length > 0 && (
                    <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                      {professorOptions.map((option) => (
                        <li key={option.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setProfessor(option);
                              setProfessorQuery(option.name);
                              setProfessorOptions([]);
                            }}
                            className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                          >
                            {option.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </label>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">总体评分</legend>
              <StarRatingInput
                value={score}
                onChange={setScore}
                disabled={submitting}
              />
              {isUpdating && (
                <p className="text-xs text-muted-foreground">
                  已保留你上次的选择，可直接修改后更新。
                </p>
              )}
            </fieldset>

            <label className="block space-y-2 text-sm font-medium">
              <span>
                匿名评论
                <span className="ml-2 font-normal text-muted-foreground">
                  选填
                </span>
              </span>
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="分享课程内容、功课量或考试体验…"
                rows={4}
                className="resize-none text-sm"
                maxLength={2000}
              />
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <p className="text-xs text-muted-foreground">
                每人每门课一票；再次投稿会更新你的评分。
              </p>
              <Button onClick={handleSubmit} disabled={submitting || !ready}>
                {submitting ? "提交中…" : isUpdating ? "更新测评" : "提交测评"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">同学测评</h2>
        <span className="text-sm text-muted-foreground">
          {reviews.length} 条评论
        </span>
      </div>

      <ul className="space-y-3">
        {reviews.length === 0 && (
          <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            还没有文字测评。你也可以只提交评分。
          </li>
        )}
        {reviews.map((review) => (
          <li key={review.id} className="rounded-xl border p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">匿名用户</span>
              <span
                className="text-xs text-muted-foreground"
                suppressHydrationWarning
              >
                {timeAgo(review.createdAt)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {review.score !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <StarIcon className="size-3 fill-current" />
                  {review.score.toFixed(1)}
                </span>
              )}
              {review.academicYear && (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
                  {review.academicYear}
                </span>
              )}
              {review.term && (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
                  {review.term}
                </span>
              )}
              {review.professorName && (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
                  {review.professorName}
                </span>
              )}
            </div>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
              {review.content}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => isAuthenticated && handleLike(review.id)}
                disabled={
                  !isAuthenticated || (submitting && busyId === review.id)
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
                  review.likedByMe
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-muted-foreground hover:bg-accent",
                  !isAuthenticated && "cursor-not-allowed opacity-60",
                )}
                title={isAuthenticated ? "点赞" : "登录后可点赞"}
              >
                <ThumbsUpIcon
                  className={cn("size-3.5", review.likedByMe && "fill-current")}
                />
                {review.likeCount}
              </button>
              {review.isOwn && (
                <button
                  type="button"
                  onClick={() => handleDelete(review.id)}
                  disabled={submitting && busyId === review.id}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  title="撤回我的评论"
                >
                  <Trash2Icon className="size-3.5" />
                  撤回
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
