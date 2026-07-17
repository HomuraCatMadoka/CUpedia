import Link from "next/link";
import { PencilIcon, StarIcon } from "lucide-react";

import { formatCourseCode } from "@/app/(main)/courses/course-types";
import { buttonVariants } from "@/components/ui/button";
import { MyReviewDeleteButton } from "@/components/courses/my-review-delete-button";
import type { MyCourseReviewHistoryItem } from "@/lib/course-review-actions";

export function MyCourseReviewHistory({
  items,
}: {
  items: MyCourseReviewHistoryItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">你还没有评价过课程。</p>
        <Link href="/courses" className={buttonVariants({ className: "mt-4" })}>
          浏览课程
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
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
