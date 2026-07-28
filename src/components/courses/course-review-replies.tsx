"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { useContributorSetup } from "@/components/auth/contributor-setup-provider";
import { CourseReviewAuthorIdentity } from "@/components/courses/course-review-author-identity";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createCourseReviewReply,
  deleteCourseReviewReply,
  getCourseReviewReplies,
  type CourseReviewReplyView,
} from "@/lib/course-review-actions";

const REPLY_SEGMENTER = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

function visibleLength(value: string): number {
  return Array.from(REPLY_SEGMENTER.segment(value)).length;
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

export function CourseReviewReplies({
  reviewId,
  initialCount,
  isAuthenticated,
  initiallyOpen = false,
  initialOffset = 0,
}: {
  reviewId: string;
  initialCount: number;
  isAuthenticated: boolean;
  initiallyOpen?: boolean;
  initialOffset?: number;
}) {
  const { ensureContributorSetup } = useContributorSetup();
  const [open, setOpen] = useState(initiallyOpen);
  const [loaded, setLoaded] = useState(false);
  const [baseOffset, setBaseOffset] = useState<number | null>(null);
  const [replies, setReplies] = useState<CourseReviewReplyView[]>([]);
  const [count, setCount] = useState(initialCount);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const length = visibleLength(content.trim());

  const load = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      setError("");
      try {
        const page = await getCourseReviewReplies(reviewId, offset);
        setReplies((current) =>
          append ? [...current, ...page.replies] : page.replies,
        );
        setNextOffset(
          append
            ? (current) => current + page.replies.length
            : offset + page.replies.length,
        );
        setHasMore(page.hasMore);
        setLoaded(true);
        if (!append) setBaseOffset(offset);
      } catch {
        setError("回复加载失败，请重试");
      } finally {
        setLoading(false);
      }
    },
    [reviewId],
  );

  useEffect(() => {
    if (!initiallyOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && baseOffset !== initialOffset) {
        void load(initialOffset, false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseOffset, initialOffset, initiallyOpen, load]);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!loaded) await load(0, false);
  }

  async function submit() {
    if (!content.trim() || length > 200) return;
    if (!(await ensureContributorSetup())) return;
    setSubmitting(true);
    setError("");
    try {
      await createCourseReviewReply(reviewId, content);
      const page = await getCourseReviewReplies(reviewId, count);
      setReplies((current) => [
        ...current,
        ...page.replies.filter(
          (reply) => !current.some((item) => item.id === reply.id),
        ),
      ]);
      setHasMore((current) => current || page.hasMore);
      setCount((current) => current + 1);
      setContent("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "回复发布失败";
      setError(
        message === "SENSITIVE_CONTENT"
          ? "回复包含敏感词，请修改后重试"
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(replyId: string) {
    if (!window.confirm("确定删除这条回复吗？删除后无法恢复。")) return;
    setSubmitting(true);
    setError("");
    try {
      await deleteCourseReviewReply(replyId);
      setReplies((current) => current.filter((reply) => reply.id !== replyId));
      setCount((current) => Math.max(0, current - 1));
    } catch {
      setError("删除回复失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        回复 {count}
      </button>
      {open && (
        <div
          role="region"
          aria-label="评论回复"
          className="mt-4 w-full basis-full border-l-2 border-border pl-4"
        >
          {loading && !loaded && (
            <p className="py-2 text-xs text-muted-foreground">正在加载回复…</p>
          )}
          {error && (
            <p role="alert" className="py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {replies.length > 0 && (
            <ul className="divide-y divide-border/70">
              {replies.map((reply) => (
                <li
                  key={reply.id}
                  className="min-w-0 py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div data-slot="reply-author" className="min-w-0 flex-1">
                      <CourseReviewAuthorIdentity
                        nickname={reply.authorNickname}
                        showcaseId={reply.authorShowcaseId}
                        variant="reply"
                      />
                    </div>
                    <span
                      className="shrink-0 text-xs text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {timeAgo(reply.createdAt)}
                    </span>
                  </div>
                  <div data-slot="reply-content" className="min-w-0">
                    <p className="mt-2 break-words text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {reply.content}
                    </p>
                    {reply.canDelete && (
                      <button
                        type="button"
                        title="删除回复"
                        disabled={submitting}
                        onClick={() => remove(reply.id)}
                        className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs text-destructive hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Trash2Icon aria-hidden="true" className="size-3" />
                        删除
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {loaded && !loading && replies.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">暂无回复</p>
          )}
          {hasMore && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => load(nextOffset, true)}
              className="mt-3"
            >
              加载更多
            </Button>
          )}
          {isAuthenticated && (
            <div className="mt-4 space-y-2">
              <Textarea
                aria-label="回复内容"
                name="course-review-reply"
                autoComplete="off"
                value={content}
                disabled={submitting}
                onChange={(event) => setContent(event.target.value)}
                placeholder="写下回复…"
                rows={3}
              />
              <div className="flex items-center justify-between gap-3">
                <span
                  aria-live="polite"
                  className={
                    length > 200
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {length}/200
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={submitting || !content.trim() || length > 200}
                  onClick={submit}
                >
                  {submitting ? "发布中…" : "发布回复"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
