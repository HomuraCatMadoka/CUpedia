"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2Icon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { OPEN_COURSE_REVIEW_EVENT } from "@/components/courses/course-review-actions";
import { cn } from "@/lib/utils";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";
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
  type CourseProfessorStats,
  type CourseRatingState,
  type ProfessorOption,
} from "@/lib/course-review-actions";

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
    attendance: COURSE_REVIEW_TAG_OPTIONS.attendance.find((tag) =>
      tags.includes(tag),
    ),
    custom: tags.filter((tag) => !PRESET_TAGS.has(tag)),
  };
}

export function CourseReviewEditor({
  code,
  ratingState,
  professorStats,
  academicYears,
  isAuthenticated,
  professorOptional,
  requiredProfessor,
}: {
  code: string;
  ratingState: CourseRatingState;
  professorStats: CourseProfessorStats[];
  academicYears: string[];
  isAuthenticated: boolean;
  professorOptional: boolean;
  requiredProfessor?: ProfessorOption;
}) {
  const router = useRouter();
  const { ensureContributorSetup } = useContributorSetup();
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
  const [searching, startSearch] = useTransition();
  const savedProfessors = ratingState.lastProfessors?.length
    ? ratingState.lastProfessors
    : ratingState.lastProfessor
      ? [ratingState.lastProfessor]
      : [];
  const initialProfessors = requiredProfessor
    ? [
        ...savedProfessors,
        ...(savedProfessors.some((item) => item.id === requiredProfessor.id)
          ? []
          : [requiredProfessor]),
      ]
    : savedProfessors;
  const [professorQuery, setProfessorQuery] = useState("");
  const [professorOptions, setProfessorOptions] = useState<ProfessorOption[]>(
    [],
  );
  const professorSearchRequest = useRef(0);
  const [selectedProfessors, setSelectedProfessors] =
    useState<ProfessorOption[]>(initialProfessors);

  useEffect(() => {
    const openEditor = () => setEditing(true);
    if (window.location.hash === "#course-review") openEditor();
    window.addEventListener(OPEN_COURSE_REVIEW_EVENT, openEditor);
    return () =>
      window.removeEventListener(OPEN_COURSE_REVIEW_EVENT, openEditor);
  }, []);

  function handleProfessorQuery(value: string) {
    const request = ++professorSearchRequest.current;
    setProfessorQuery(value);
    if (!value.trim()) {
      setProfessorOptions([]);
      return;
    }
    setProfessorOptions([]);
    startSearch(async () => {
      try {
        const options = await searchProfessors(code, value);
        if (request === professorSearchRequest.current) {
          setProfessorOptions(options);
        }
      } catch {
        if (request === professorSearchRequest.current) {
          setProfessorOptions([]);
        }
      }
    });
  }

  function addProfessor(professor: ProfessorOption) {
    setSelectedProfessors((current) =>
      current.some((item) => item.id === professor.id)
        ? current
        : [...current, professor],
    );
    professorSearchRequest.current += 1;
    setProfessorQuery("");
    setProfessorOptions([]);
  }

  function removeProfessor(professorId: string) {
    if (professorId === requiredProfessor?.id) return;
    setSelectedProfessors((current) =>
      current.filter((item) => item.id !== professorId),
    );
  }

  function handleSubmit() {
    setError("");
    startSubmit(async () => {
      try {
        if (!academicYear) throw new Error("请选择学年");
        if (!term) throw new Error("请选择学期");
        if (!selectedProfessors.length && !professorOptional)
          throw new Error("请选择任课教授");
        if (score === null) throw new Error("请选择总体评分");
        if (!isAnonymous && !(await ensureContributorSetup())) return;
        const result = await submitCourseReview(code, {
          academicYear,
          term,
          professorIds: selectedProfessors.map((professor) => professor.id),
          score,
          content,
          tags: reviewTags,
          isAnonymous,
        });
        for (const notice of result.newAchievementNotices) {
          toast.success(`可以领取「${notice.displayName}」了`, {
            action: {
              label: "去看看",
              onClick: () => router.push("/courses/achievements"),
            },
          });
        }
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

  function handleDelete() {
    startSubmit(async () => {
      const impact = await getCourseReviewDeletionImpact(code);
      const achievementCopy =
        impact.kind === "downgraded"
          ? `\n\n删除后，有关专业成就将降为${impact.nextTier === "silver" ? "银级" : "铜级"}。`
          : impact.kind === "revoked"
            ? "\n\n删除后，有关专业成就将不再满足条件并被撤销。"
            : impact.kind === "dismantled"
              ? "\n\n删除后，人物成就将自动拆解，仍有效的来源成就会恢复。"
              : "";
      if (
        !window.confirm(
          `确定删除整条课程测评吗？评分、评论、收到的点赞和回复都会一并删除。${achievementCopy}`,
        )
      ) {
        return;
      }
      await deleteCourseReviewSubmission(code, undefined, impact.kind);
      setIsAnonymous(false);
      setEditing(false);
      router.refresh();
    });
  }

  const ready =
    !!academicYear &&
    !!term &&
    (selectedProfessors.length > 0 || professorOptional) &&
    score !== null;
  const availableProfessorOptions = professorOptions.filter(
    (option) =>
      !selectedProfessors.some((selected) => selected.id === option.id),
  );
  const suggestedProfessors = professorStats.filter(
    (professor) =>
      professor.terms.some(
        (offering) =>
          offering.academicYear === academicYear && offering.term === term,
      ) && !selectedProfessors.some((selected) => selected.id === professor.id),
  );

  function resetForm() {
    setAcademicYear(ratingState.lastAcademicYear ?? "");
    setTerm(ratingState.lastTerm ?? "");
    setScore(ratingState.lastScore);
    setSelectedProfessors(initialProfessors);
    setProfessorQuery("");
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
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b bg-secondary/25 px-6 py-5">
        <h2 className="text-lg font-semibold">
          {isPublished ? "我的课程测评" : "提交课程测评"}
        </h2>
      </div>

      {!isAuthenticated ? (
        <div className="m-6 rounded-xl border bg-secondary/40 p-4 text-sm text-muted-foreground">
          请先{" "}
          <Link href="/login" className="font-medium text-foreground underline">
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
              {savedProfessors.map((professor) => (
                <span
                  key={professor.id}
                  className="rounded-full bg-secondary px-3 py-1.5"
                >
                  {professor.name}
                </span>
              ))}
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
                data-testid="delete-own-course-review"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete()}
                disabled={submitting}
              >
                <Trash2Icon className="size-4" />
                删除
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end p-6">
            <Button onClick={() => setEditing(true)}>
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
                onChange={(event) => setTerm(event.target.value as CourseTerm)}
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

          <fieldset className="block space-y-2 text-sm font-medium">
            <legend className="mb-2 w-full">
              <span className="flex w-full items-center justify-between gap-3">
                <span>
                  任课教授
                  {professorOptional && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      选填
                    </span>
                  )}
                </span>
                {selectedProfessors.length > 0 && (
                  <span
                    aria-live="polite"
                    className="text-xs font-normal tabular-nums text-muted-foreground"
                  >
                    已选择 {selectedProfessors.length} 位教授
                  </span>
                )}
              </span>
            </legend>
            <div className="space-y-2">
              {selectedProfessors.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedProfessors.map((professor) =>
                    professor.id === requiredProfessor?.id ? (
                      <span
                        key={professor.id}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-left text-xs font-normal text-foreground"
                      >
                        <span className="min-w-0 break-words">
                          {professor.name}
                        </span>
                        <span className="text-muted-foreground">已绑定</span>
                      </span>
                    ) : (
                      <button
                        key={professor.id}
                        type="button"
                        onClick={() => removeProfessor(professor.id)}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-left text-xs font-normal text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-[0.98]"
                        aria-label={`移除 ${professor.name}`}
                      >
                        <span className="min-w-0 break-words">
                          {professor.name}
                        </span>
                        <XIcon aria-hidden="true" className="size-3 shrink-0" />
                      </button>
                    ),
                  )}
                </div>
              )}
              <Command
                shouldFilter={false}
                className="relative overflow-visible rounded-lg border bg-background p-0"
              >
                <CommandInput
                  aria-label="搜索任课教授"
                  name="professor-search"
                  value={professorQuery}
                  onValueChange={handleProfessorQuery}
                  placeholder={
                    selectedProfessors.length
                      ? "继续搜索其他教授…"
                      : "搜索任课教授姓名…"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9"
                />
                {professorQuery ? (
                  <CommandList className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-20 max-h-48 rounded-md border bg-popover p-1 shadow-md">
                    <CommandEmpty>
                      {searching ? "搜索中…" : "没有匹配的教授"}
                    </CommandEmpty>
                    {availableProfessorOptions.map((option) => (
                      <CommandItem
                        key={option.id}
                        value={`${option.name} ${option.id}`}
                        onSelect={() => addProfessor(option)}
                        className="block px-2 py-1.5 [&>svg:last-child]:hidden"
                      >
                        <span className="block">{option.name}</span>
                        {option.description && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandList>
                ) : null}
              </Command>
            </div>
            {suggestedProfessors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 px-1 pt-0.5">
                <span className="mr-0.5 text-xs font-normal text-muted-foreground">
                  {academicYear} · {term} 任课
                </span>
                {suggestedProfessors.map((professor) => (
                  <button
                    key={professor.id}
                    type="button"
                    onClick={() => addProfessor(professor)}
                    className="rounded-md border border-dashed bg-background px-2.5 py-1 text-xs font-normal text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-secondary/50 hover:text-foreground active:scale-[0.98]"
                  >
                    + {professor.name}
                  </button>
                ))}
              </div>
            )}
            {professorOptional && (
              <span className="block text-xs font-normal text-muted-foreground">
                课程资料未列任课教授，可留空
              </span>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">总体评分</legend>
            <StarRatingInput
              value={score}
              onChange={setScore}
              disabled={submitting}
            />
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-medium">
              课程体验
              <span className="ml-2 font-normal text-muted-foreground">
                选填
              </span>
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5">
              {(
                Object.entries(COURSE_REVIEW_TAG_OPTIONS) as [
                  keyof typeof COURSE_REVIEW_TAG_OPTIONS,
                  readonly string[],
                ][]
              ).map(([dimension, options]) => (
                <div key={dimension} className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {dimension === "workload"
                      ? "Workload"
                      : dimension === "grade"
                        ? "Grade"
                        : dimension === "enrollment"
                          ? "抢课难度"
                          : "考勤要求"}
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1">
                    {options.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={reviewTags[dimension] === tag}
                        onClick={() => togglePreset(dimension, tag)}
                        className={cn(
                          "min-h-9 w-full whitespace-nowrap rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          reviewTags[dimension] === tag
                            ? "bg-background text-foreground shadow-sm"
                            : "bg-transparent hover:bg-background/70",
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

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
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
                {submitting ? "保存中…" : isPublished ? "保存修改" : "提交测评"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
