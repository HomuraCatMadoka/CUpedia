"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StarIcon, ThumbsUpIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { CourseReviewAuthorIdentity } from "@/components/courses/course-review-author-identity";
import { CourseReviewReplies } from "@/components/courses/course-review-replies";
import { cn } from "@/lib/utils";
import {
  deleteCourseReviewSubmission,
  getCourseReviewDeletionImpact,
  toggleLike,
  type CourseReviewView,
} from "@/lib/course-review-actions";

function CourseReviewLikeButton({
  reviewId,
  initialCount,
  initialLiked,
  isAuthenticated,
}: {
  reviewId: string;
  initialCount: number;
  initialLiked: boolean;
  isAuthenticated: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [feedbackId, setFeedbackId] = useState(0);
  const [pending, startLike] = useTransition();

  function handleLike() {
    const nextLiked = !liked;
    const nextCount = Math.max(0, count + (nextLiked ? 1 : -1));

    setLiked(nextLiked);
    setCount(nextCount);
    setFeedbackId((current) => current + 1);
    startLike(async () => {
      try {
        setCount(await toggleLike(reviewId));
      } catch {
        setLiked(liked);
        setCount(count);
        toast.error(nextLiked ? "点赞失败，请重试" : "取消点赞失败，请重试");
      }
    });
  }

  return (
    <button
      type="button"
      aria-label={isAuthenticated ? "点赞" : "登录后可点赞"}
      aria-pressed={liked}
      aria-busy={pending}
      onClick={handleLike}
      disabled={!isAuthenticated || pending}
      className={cn(
        "relative inline-flex min-h-11 items-center gap-1.5 overflow-visible rounded-full border px-3.5 text-xs font-medium tabular-nums transition-colors active:translate-y-px disabled:cursor-wait sm:min-h-9",
        liked
          ? "border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
        !isAuthenticated && "cursor-not-allowed opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
      title={isAuthenticated ? "点赞" : "登录后可点赞"}
    >
      <span
        key={feedbackId}
        className={cn(
          "relative flex size-4 items-center justify-center",
          feedbackId > 0
            ? liked
              ? "course-like-pop"
              : "course-like-unlike"
            : undefined,
        )}
      >
        {feedbackId > 0 && liked ? (
          <span
            className="course-like-burst absolute -inset-1 rounded-full bg-primary/20"
            aria-hidden="true"
          />
        ) : null}
        <ThumbsUpIcon
          className={cn("relative z-10 size-4", liked && "fill-current")}
          aria-hidden="true"
        />
      </span>
      <span
        key={`count-${feedbackId}`}
        className={feedbackId > 0 ? "course-like-count" : undefined}
      >
        {count}
      </span>
      {feedbackId > 0 && liked ? (
        <span
          key={`plus-${feedbackId}`}
          className="course-like-plus pointer-events-none absolute -top-2 right-0 text-[10px] font-semibold text-primary"
          aria-hidden="true"
        >
          +1
        </span>
      ) : null}
    </button>
  );
}

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

export function CourseReviewCard({
  code,
  review,
  isAuthenticated,
  targetReplyId,
  targetReplyOffset,
  hideAvatar = false,
}: {
  code: string;
  review: CourseReviewView;
  isAuthenticated: boolean;
  targetReplyId?: string;
  targetReplyOffset?: number;
  hideAvatar?: boolean;
}) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();

  function handleDelete() {
    startDelete(async () => {
      const target = { id: review.id, type: "review" as const };
      const impact = await getCourseReviewDeletionImpact(code, target);
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
      await deleteCourseReviewSubmission(code, target, impact.kind);
      router.refresh();
    });
  }

  return (
    <li
      id={`course-review-${review.id}`}
      className="scroll-mt-24 rounded-xl border p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CourseReviewAuthorIdentity
            nickname={review.authorNickname}
            showcaseId={review.authorShowcaseId}
            achievements={review.authorAchievements}
            avatarUrl={review.authorAvatarUrl}
            equippedTitle={review.authorEquippedTitle}
            achievementLabel="作者成就"
            hideAvatar={hideAvatar}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          <span suppressHydrationWarning>{timeAgo(review.createdAt)}</span>
          {review.isEdited && (
            <>
              <span> · </span>
              <span>已编辑</span>
            </>
          )}
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
        {(review.professors?.length
          ? review.professors
          : review.professorId && review.professorName
            ? [{ id: review.professorId, name: review.professorName }]
            : []
        ).map((professor) => (
          <span
            key={professor.id}
            className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground"
          >
            {professor.name}
          </span>
        ))}
        {review.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-primary/10 px-2.5 py-1 text-primary"
          >
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
        {review.content}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <CourseReviewLikeButton
          key={`${review.id}:${review.likeCount}:${review.likedByMe}`}
          reviewId={review.id}
          initialCount={review.likeCount}
          initialLiked={review.likedByMe}
          isAuthenticated={isAuthenticated}
        />
        <CourseReviewReplies
          key={targetReplyId ?? "default"}
          reviewId={review.id}
          initialCount={review.replyCount}
          isAuthenticated={isAuthenticated}
          initiallyOpen={Boolean(targetReplyId)}
          initialOffset={targetReplyOffset}
        />
        {review.canAdminDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            title="删除整条投稿"
          >
            <Trash2Icon className="size-3.5" />
            删除投稿
          </button>
        )}
      </div>
    </li>
  );
}
