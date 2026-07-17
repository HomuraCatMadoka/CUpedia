"use client";

import { MessageSquareTextIcon, PencilLineIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const OPEN_COURSE_REVIEW_EVENT = "course-review:open";

export function CourseReviewActions({
  hasPublishedReview,
  writeReviewHref,
  commentsHref,
}: {
  hasPublishedReview: boolean;
  writeReviewHref: string;
  commentsHref: string;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-2" aria-label="课程测评操作">
      <Link
        href={writeReviewHref}
        className={buttonVariants({ size: "lg" })}
        onClick={(event) => {
          const reviewSection = document.getElementById("course-review");
          if (reviewSection) {
            event.preventDefault();
            window.history.replaceState(
              window.history.state,
              "",
              writeReviewHref,
            );
            reviewSection.scrollIntoView({ block: "start" });
          }
          window.dispatchEvent(new Event(OPEN_COURSE_REVIEW_EVENT));
        }}
      >
        <PencilLineIcon aria-hidden="true" />
        {hasPublishedReview ? "编辑测评" : "写测评"}
      </Link>
      <Link
        href={commentsHref}
        className={buttonVariants({ size: "lg", variant: "outline" })}
      >
        <MessageSquareTextIcon aria-hidden="true" />
        查看评论
      </Link>
    </div>
  );
}
