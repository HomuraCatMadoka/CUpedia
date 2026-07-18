"use client";

import Link from "next/link";
import { ChevronDownIcon, PencilIcon, StarIcon } from "lucide-react";
import { useState } from "react";

import { formatCourseCode } from "@/app/(main)/courses/course-types";
import { buttonVariants } from "@/components/ui/button";
import { MyReviewDeleteButton } from "@/components/courses/my-review-delete-button";
import type { MyCourseReviewHistoryItem } from "@/lib/course-review-actions";

function subjectCode(courseCode: string) {
  return (
    courseCode
      .replace(/\s+/g, "")
      .toUpperCase()
      .match(/^[A-Z]+/)?.[0] ?? courseCode
  );
}

export function MyCourseReviewHistory({
  items,
}: {
  items: MyCourseReviewHistoryItem[];
}) {
  const [selectedSubject, setSelectedSubject] = useState("all");
  const subjectCounts = new Map<string, number>();
  for (const item of items) {
    const subject = subjectCode(item.courseCode);
    subjectCounts.set(subject, (subjectCounts.get(subject) ?? 0) + 1);
  }
  const subjects = [...subjectCounts].sort(([a], [b]) => a.localeCompare(b));
  const filteredItems =
    selectedSubject === "all"
      ? items
      : items.filter(
          (item) => subjectCode(item.courseCode) === selectedSubject,
        );
  const courseCount = new Set(items.map((item) => item.courseCode)).size;

  const subjectPicker =
    items.length > 0 ? (
      <label className="relative block w-full sm:w-64">
        <span className="sr-only">按学科筛选</span>
        <select
          aria-label="按学科筛选"
          className="h-9 w-full appearance-none rounded-lg border border-input bg-transparent px-3 pr-9 text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setSelectedSubject(event.target.value)}
          value={selectedSubject}
        >
          <option value="all">全部学科 {courseCount} 门</option>
          {subjects.map(([subject, count]) => (
            <option key={subject} value={subject}>
              {subject} {count} 门
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </label>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {subjectPicker}
        <p className="shrink-0 text-sm font-medium">
          已评价 {courseCount} 门课
        </p>
      </div>

      {items.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            你还没有提交过课程测评。
          </p>
          <Link
            href="/courses"
            className={buttonVariants({ className: "mt-4" })}
          >
            浏览课程
          </Link>
        </div>
      )}

      {filteredItems.map((item) => {
        const editHref = `/courses/${encodeURIComponent(item.courseCode)}?from=${encodeURIComponent("/courses/my-reviews")}#course-review`;
        return (
          <article
            className="rounded-2xl border bg-card p-5"
            key={item.ratingId}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-muted-foreground">
                  {formatCourseCode(item.courseCode)}
                </p>
                <h2 className="mt-1 font-semibold">{item.courseTitle}</h2>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <StarIcon
                  className="size-3.5 fill-current"
                  aria-hidden="true"
                />
                {item.score.toFixed(1)}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {item.academicYear && <span>{item.academicYear}</span>}
              {item.term && <span>· {item.term}</span>}
              {item.professorName && <span>· {item.professorName}</span>}
              <span>· {item.isAnonymous ? "匿名" : "署名"}</span>
            </div>
            {item.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span
                    className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-xl bg-secondary/25 p-4 text-sm">
              {item.content ? (
                <p className="leading-relaxed whitespace-pre-wrap">
                  {item.content}
                </p>
              ) : (
                <p className="text-muted-foreground">未填写文字评论</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Link
                href={editHref}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                <PencilIcon aria-hidden="true" />
                编辑
              </Link>
              <MyReviewDeleteButton
                courseCode={item.courseCode}
                ratingId={item.ratingId}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}
