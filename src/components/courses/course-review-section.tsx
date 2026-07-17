"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2Icon,
  PencilIcon,
  StarIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OPEN_COURSE_REVIEW_EVENT } from "@/components/courses/course-review-actions";
import { ProfessionalBadgeLogo } from "@/components/courses/professional-badge-logo";
import { cn } from "@/lib/utils";
import {
  COURSE_REVIEW_TAG_OPTIONS,
  COURSE_TERMS,
  type CourseReviewTags,
  type CourseTerm,
} from "@/lib/course-review-constants";
import {
  deleteCourseReviewSubmission,
  getCourseReviewDeletionImpact,
  searchProfessors,
  submitCourseReview,
  toggleLike,
  type CourseProfessorStats,
  type CourseRatingState,
  type CourseReviewView,
  type ProfessorOption,
} from "@/lib/course-review-actions";

const INITIAL_REVIEW_LIMIT = 10;

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
            <span
              key={position}
              className="relative rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <StarGlyph value={value ?? 0} position={position} />
              {[position - 0.5, position].map((score, half) => (
                <button
                  key={score}
                  type="button"
                  role="radio"
                  aria-label={`${score} 星`}
                  aria-checked={value === score}
                  disabled={disabled}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => onChange(score)}
                  className={cn(
                    "absolute inset-y-0 z-10 w-1/2 rounded-sm focus-visible:outline-none",
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

const PRESET_TAGS = new Set<string>(
  Object.values(COURSE_REVIEW_TAG_OPTIONS).flat(),
);

function parseReviewTags(tags: string[]): CourseReviewTags {
  return {
    workload: COURSE_REVIEW_TAG_OPTIONS.workload.find((tag) =>
      tags.includes(tag),
    ),
    grade: COURSE_REVIEW_TAG_OPTIONS.grade.find((tag) => tags.includes(tag)),
    enrollment: COURSE_REVIEW_TAG_OPTIONS.enrollment.find((tag) =>
      tags.includes(tag),
    ),
    custom: tags.filter((tag) => !PRESET_TAGS.has(tag)),
  };
}

export function CourseReviewSection({
  code,
  reviews,
  ratingState,
  professorStats,
  academicYears,
  isAuthenticated,
  professorOptional,
}: {
  code: string;
  reviews: CourseReviewView[];
  ratingState: CourseRatingState;
  professorStats: CourseProfessorStats[];
  academicYears: string[];
  isAuthenticated: boolean;
  professorOptional: boolean;
}) {
  const router = useRouter();
  const isPublished = ratingState.lastScore !== null;
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(ratingState.lastContent);
  const [academicYear, setAcademicYear] = useState(
    ratingState.lastAcademicYear ?? "",
  );
  const [term, setTerm] = useState<CourseTerm | "">(ratingState.lastTerm ?? "");
  const [score, setScore] = useState<number | null>(ratingState.lastScore);
  const [reviewTags, setReviewTags] = useState<CourseReviewTags>(() =>
    parseReviewTags(ratingState.lastTags),
  );
  const [isAnonymous, setIsAnonymous] = useState(ratingState.lastIsAnonymous);
  const [customTagInput, setCustomTagInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, startSubmit] = useTransition();
  const [, startSearch] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedProfessorId, setSelectedProfessorId] = useState("");
  const [visibleReviewLimit, setVisibleReviewLimit] =
    useState(INITIAL_REVIEW_LIMIT);
  const [showAllTermYears, setShowAllTermYears] = useState(false);
  const [professorQuery, setProfessorQuery] = useState(
    ratingState.lastProfessor?.name ?? "",
  );
  const [professorOptions, setProfessorOptions] = useState<ProfessorOption[]>(
    [],
  );
  const [professor, setProfessor] = useState<ProfessorOption | null>(
    ratingState.lastProfessor,
  );

  useEffect(() => {
    const openEditor = () => setEditing(true);
    if (window.location.hash === "#course-review") openEditor();
    window.addEventListener(OPEN_COURSE_REVIEW_EVENT, openEditor);
    return () =>
      window.removeEventListener(OPEN_COURSE_REVIEW_EVENT, openEditor);
  }, []);

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
        if (!professor && !professorOptional) throw new Error("请选择任课教授");
        if (score === null) throw new Error("请选择总体评分");
        await submitCourseReview(code, {
          academicYear,
          term,
          professorId: professor?.id ?? null,
          score,
          content,
          tags: reviewTags,
          isAnonymous,
        });
        setEditing(false);
        router.refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "提交失败";
        setError(
          message === "SENSITIVE_CONTENT"
            ? "自定义标签包含敏感词，请修改后重试"
            : message,
        );
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

  function handleDelete(target?: { id: string; type: "review" | "rating" }) {
    setBusyId(target?.id ?? "own-submission");
    startSubmit(async () => {
      try {
        const impact = await getCourseReviewDeletionImpact(code, target);
        const achievementCopy =
          impact.kind === "downgraded"
            ? `\n\n删除后，有关专业称号将降为${impact.nextTier === "silver" ? "银标" : "铜标"}。`
            : impact.kind === "revoked"
              ? "\n\n删除后，有关专业称号将不再满足条件并被撤销。"
              : impact.kind === "dismantled"
                ? "\n\n删除后，人名称号将自动拆解，仍有效的来源称号会恢复。"
                : "";
        if (
          !window.confirm(
            `确定删除整条课程测评吗？评分、评论和收到的点赞都会一并删除。${achievementCopy}`,
          )
        ) {
          return;
        }
        await deleteCourseReviewSubmission(code, target, impact.kind);
        if (!target) {
          setIsAnonymous(false);
          setEditing(false);
        }
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  const ready =
    !!academicYear &&
    !!term &&
    (!!professor || professorOptional) &&
    score !== null;
  const selectedProfessor = professorStats.find(
    (item) => item.id === selectedProfessorId,
  );
  const visibleReviews = selectedProfessor
    ? reviews.filter((review) => review.professorId === selectedProfessor.id)
    : reviews;
  const visibleCommentCount = visibleReviews.filter(
    (review) => !review.isRatingOnly,
  ).length;
  const displayedReviews = visibleReviews.slice(0, visibleReviewLimit);
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

  function resetForm() {
    setAcademicYear(ratingState.lastAcademicYear ?? "");
    setTerm(ratingState.lastTerm ?? "");
    setScore(ratingState.lastScore);
    setProfessor(ratingState.lastProfessor);
    setProfessorQuery(ratingState.lastProfessor?.name ?? "");
    setContent(ratingState.lastContent);
    setReviewTags(parseReviewTags(ratingState.lastTags));
    setIsAnonymous(ratingState.lastIsAnonymous);
    setCustomTagInput("");
    setError("");
  }

  function togglePreset(
    dimension: keyof typeof COURSE_REVIEW_TAG_OPTIONS,
    tag: string,
  ) {
    setReviewTags((current) => ({
      ...current,
      [dimension]: current[dimension] === tag ? undefined : tag,
    }));
  }

  function addCustomTag() {
    const tag = customTagInput.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const custom = reviewTags.custom ?? [];
    if (!tag) return;
    if (tag.length > 12) {
      setError("自定义标签最多 12 个字符");
      return;
    }
    if (PRESET_TAGS.has(tag) || custom.includes(tag)) {
      setCustomTagInput("");
      return;
    }
    if (custom.length >= 5) {
      setError("自定义标签最多 5 个");
      return;
    }
    setReviewTags((current) => ({
      ...current,
      custom: [...(current.custom ?? []), tag],
    }));
    setCustomTagInput("");
    setError("");
  }

  function removeCustomTag(tag: string) {
    setReviewTags((current) => ({
      ...current,
      custom: (current.custom ?? []).filter((item) => item !== tag),
    }));
  }

  return (
    <section id="course-review" className="scroll-mt-20 space-y-8">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-secondary/25 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold">
              {isPublished ? "我的课程测评" : "提交课程测评"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isPublished
                ? "你可以随时修改署名方式，或删除这条投稿。"
                : "记录你实际修读的学期；评论选填，默认展示你的昵称。"}
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
        ) : !editing ? (
          isPublished ? (
            <div className="space-y-5 p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2Icon className="size-4" />
                课程测评已发布
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <StarIcon className="size-3.5 fill-current" />
                  {ratingState.lastScore?.toFixed(1)}
                </span>
                <span className="rounded-full bg-secondary px-3 py-1.5">
                  {ratingState.lastAcademicYear}
                </span>
                <span className="rounded-full bg-secondary px-3 py-1.5">
                  {ratingState.lastTerm}
                </span>
                {ratingState.lastProfessor && (
                  <span className="rounded-full bg-secondary px-3 py-1.5">
                    {ratingState.lastProfessor.name}
                  </span>
                )}
                {ratingState.lastTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-primary/10 px-3 py-1.5 text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="rounded-xl border bg-secondary/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {ratingState.lastContent
                    ? ratingState.lastIsAnonymous
                      ? "已附匿名评论"
                      : "已附署名评论"
                    : "未填写文字评论"}
                </p>
                {ratingState.lastContent && (
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                    {ratingState.lastContent}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t pt-5">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <PencilIcon className="size-4" />
                  编辑
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete()}
                  disabled={submitting && busyId === "own-submission"}
                >
                  <Trash2Icon className="size-4" />
                  删除
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">分享你的实际修读体验</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  评分必填，文字评论和课程体验标签均为选填。
                </p>
              </div>
              <Button
                className="self-start sm:self-auto"
                onClick={() => setEditing(true)}
              >
                <PencilIcon className="size-4" />
                开始填写
              </Button>
            </div>
          )
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
              <span>
                任课教授
                {professorOptional && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    选填
                  </span>
                )}
              </span>
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
                            <span className="block">{option.name}</span>
                            {option.description && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {option.description}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
              {professorOptional && (
                <span className="block text-xs font-normal text-muted-foreground">
                  课程资料未列任课教授，可留空
                </span>
              )}
            </label>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">总体评分</legend>
              <StarRatingInput
                value={score}
                onChange={setScore}
                disabled={submitting}
              />
              {isPublished && (
                <p className="text-xs text-muted-foreground">
                  已保留你上次的选择，可直接修改后更新。
                </p>
              )}
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="text-sm font-medium">
                课程体验
                <span className="ml-2 font-normal text-muted-foreground">
                  选填
                </span>
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  Object.entries(COURSE_REVIEW_TAG_OPTIONS) as [
                    keyof typeof COURSE_REVIEW_TAG_OPTIONS,
                    readonly string[],
                  ][]
                ).map(([dimension, options]) => (
                  <div key={dimension} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {dimension === "workload"
                        ? "Workload"
                        : dimension === "grade"
                          ? "Grade"
                          : "抢课难度"}
                    </p>
                    <div className="flex gap-2">
                      {options.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          aria-pressed={reviewTags[dimension] === tag}
                          onClick={() => togglePreset(dimension, tag)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs transition-colors",
                            reviewTags[dimension] === tag
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-background hover:bg-accent",
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(reviewTags.custom ?? []).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => removeCustomTag(tag)}
                      className="rounded-full bg-secondary px-3 py-1.5 text-xs hover:bg-destructive/10 hover:text-destructive"
                      title="移除自定义标签"
                    >
                      {tag} ×
                    </button>
                  ))}
                </div>
                <div className="flex max-w-md gap-2">
                  <input
                    value={customTagInput}
                    onChange={(event) => setCustomTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCustomTag();
                      }
                    }}
                    placeholder="添加自定义标签"
                    maxLength={12}
                    disabled={(reviewTags.custom?.length ?? 0) >= 5}
                    className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCustomTag}
                    disabled={
                      !customTagInput.trim() ||
                      (reviewTags.custom?.length ?? 0) >= 5
                    }
                  >
                    添加
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  最多 5 个，每个最多 12 个字符
                </p>
              </div>
            </fieldset>

            <label className="block space-y-2 text-sm font-medium">
              <span>
                文字评论
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
            <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-5">
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(event) => setIsAnonymous(event.target.checked)}
                    className="size-4 rounded border-input accent-primary"
                  />
                  匿名发表
                </label>
                <Button
                  variant="ghost"
                  onClick={() => {
                    resetForm();
                    setEditing(false);
                  }}
                  disabled={submitting}
                >
                  取消
                </Button>
                <Button onClick={handleSubmit} disabled={submitting || !ready}>
                  {submitting
                    ? "保存中…"
                    : isPublished
                      ? "保存修改"
                      : "提交测评"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

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
              value={selectedProfessorId}
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
          <li key={review.id} className="rounded-xl border p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {review.isRatingOnly ? (
                  <span className="text-sm font-medium">仅评分投稿</span>
                ) : review.authorShowcaseId && review.authorNickname ? (
                  <Link
                    className="text-sm font-medium hover:underline"
                    href={`/courses/achievements/showcase/${review.authorShowcaseId}`}
                  >
                    {review.authorNickname}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">
                    {review.authorNickname ?? "匿名用户"}
                  </span>
                )}
                {review.authorAchievements.length > 0 && (
                  <div
                    aria-label="作者成就"
                    className="mt-2 flex flex-wrap items-center gap-1.5"
                  >
                    {[...review.authorAchievements]
                      .sort((a, b) => Number(b.primary) - Number(a.primary))
                      .map((achievement) => (
                        <ProfessionalBadgeLogo
                          className={cn(
                            "rounded-full",
                            achievement.primary &&
                              "ring-2 ring-amber-500 ring-offset-1",
                          )}
                          code={achievement.badgeCode}
                          key={achievement.id}
                          size={28}
                          tier={achievement.tier}
                        />
                      ))}
                  </div>
                )}
              </div>
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
              {review.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-primary/10 px-2.5 py-1 text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
            {!review.isRatingOnly && (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
                {review.content}
              </p>
            )}
            <div className="mt-4 flex items-center gap-3">
              {!review.isRatingOnly && (
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
                    className={cn(
                      "size-3.5",
                      review.likedByMe && "fill-current",
                    )}
                  />
                  {review.likeCount}
                </button>
              )}
              {review.canAdminDelete && (
                <button
                  type="button"
                  onClick={() =>
                    handleDelete({
                      id: review.id,
                      type: review.isRatingOnly ? "rating" : "review",
                    })
                  }
                  disabled={submitting && busyId === review.id}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  title="删除整条投稿"
                >
                  <Trash2Icon className="size-3.5" />
                  删除投稿
                </button>
              )}
            </div>
          </li>
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
