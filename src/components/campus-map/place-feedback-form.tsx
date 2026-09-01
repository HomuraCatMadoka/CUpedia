"use client";

import { StarIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { runCampusMapPlaceFeedbackAction } from "@/lib/campus-map/place-feedback-actions";
import type { CampusMapPlaceFeedbackView } from "@/lib/campus-map/place-feedback";
import { cn } from "@/lib/utils";

function feedbackError(code: string) {
  switch (code) {
    case "invalid-rating":
      return "请选择 1 至 5 星。";
    case "content-too-long":
      return "评价内容过长，请缩短后再试。";
    case "sensitive-content":
      return "评价含有不能发布的内容，请修改后再试。";
    case "feedback-version-conflict":
      return "这条评价已在别处更新，请刷新后再试。";
    case "feedback-already-exists":
      return "你已经评价过这个地点，请刷新后修改原评价。";
    case "place-read-only":
      return "这个地点已停用或合并，评价只能阅读。";
    case "profile-incomplete":
      return "请先完成昵称和密码设置。";
    case "actor-banned":
    case "actor-not-eligible":
      return "当前账号不能提交评价。";
    case "authentication-required":
      return "登录状态已失效，请重新登录。";
    default:
      return "暂时无法保存评价，请稍后重试。";
  }
}

function resultErrorCode(
  result: Awaited<ReturnType<typeof runCampusMapPlaceFeedbackAction>>,
) {
  if (result.status === "validation-failed") {
    return result.errors[0]?.code ?? "validation-failed";
  }
  return "code" in result ? result.code : "unexpected-result";
}

export function PlaceFeedbackForm({
  placeId,
  initialFeedback,
  readOnly,
}: {
  placeId: string;
  initialFeedback: CampusMapPlaceFeedbackView | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const firstRatingRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [rating, setRating] = useState(initialFeedback?.rating ?? 0);
  const [content, setContent] = useState(initialFeedback?.content ?? "");
  const [feedback, setFeedback] = useState(initialFeedback);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  // Refresh after the pending state commits so the RSC request is not aborted.
  useEffect(() => {
    if (refreshVersion > 0) router.refresh();
  }, [refreshVersion, router]);

  if (readOnly) {
    return (
      <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        这个地点已停用或合并，现有评价仍可阅读，但不能再新增、修改或删除。
      </p>
    );
  }

  async function submit() {
    if (rating < 1 || rating > 5) {
      setError("请选择 1 至 5 星。");
      firstRatingRef.current?.focus();
      return;
    }
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const result = await runCampusMapPlaceFeedbackAction(
        feedback
          ? {
              kind: "update",
              feedbackId: feedback.id,
              expectedVersion: feedback.version,
              rating,
              content,
            }
          : { kind: "create", placeId, rating, content },
      );
      if (result.status === "created" || result.status === "updated") {
        setFeedback(result.feedback);
        setRating(result.feedback.rating);
        setContent(result.feedback.content ?? "");
        setMessage(
          result.status === "created" ? "评价已发布。" : "评价已更新。",
        );
        setRefreshVersion((version) => version + 1);
        return;
      }
      const errorCode = resultErrorCode(result);
      setError(feedbackError(errorCode));
      if (errorCode === "invalid-rating") firstRatingRef.current?.focus();
      if (
        errorCode === "content-too-long" ||
        errorCode === "sensitive-content"
      ) {
        contentRef.current?.focus();
      }
    } catch {
      setError("网络连接中断，请保留内容后重试。");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (
      !feedback ||
      !window.confirm("确认删除你的评分和评价？删除后无法恢复。")
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const result = await runCampusMapPlaceFeedbackAction({
        kind: "delete",
        feedbackId: feedback.id,
        expectedVersion: feedback.version,
      });
      if (result.status === "deleted") {
        setFeedback(null);
        setRating(0);
        setContent("");
        setMessage("评价已删除。你可以重新评分。");
        setRefreshVersion((version) => version + 1);
        return;
      }
      setError(feedbackError(resultErrorCode(result)));
    } catch {
      setError("网络连接中断，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  const errorId = `${id}-error`;
  return (
    <div className="grid gap-4 rounded-2xl border bg-background p-4">
      {feedback?.visibility === "hidden" ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          你的评价已被管理员隐藏。修改不会自动重新公开，管理员复核后才会恢复展示。
        </p>
      ) : null}
      <fieldset
        disabled={pending}
        aria-describedby={error ? errorId : undefined}
      >
        <legend className="text-sm font-semibold">评分（必填）</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <span key={value}>
              <input
                ref={value === 1 ? firstRatingRef : undefined}
                id={`${id}-${value}`}
                className="peer sr-only"
                type="radio"
                name={`${id}-rating`}
                value={value}
                checked={rating === value}
                onChange={() => {
                  setRating(value);
                  setError(null);
                  setMessage(null);
                }}
              />
              <label
                htmlFor={`${id}-${value}`}
                className={cn(
                  "inline-flex min-h-11 min-w-12 touch-manipulation cursor-pointer items-center justify-center gap-1 rounded-xl border px-2 text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-amber-600 peer-focus-visible:ring-offset-2",
                  rating === value
                    ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                    : "hover:bg-muted",
                )}
              >
                <StarIcon
                  aria-hidden="true"
                  className={cn(
                    "size-4",
                    rating >= value && "fill-current text-amber-600",
                  )}
                />
                {value} 星
              </label>
            </span>
          ))}
        </div>
      </fieldset>
      <label
        className="grid gap-2 text-sm font-semibold"
        htmlFor={`${id}-content`}
      >
        评价（选填）
        <textarea
          ref={contentRef}
          id={`${id}-content`}
          name="campus-map-place-feedback-content"
          autoComplete="off"
          value={content}
          disabled={pending}
          maxLength={2000}
          rows={4}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : `${id}-count`}
          className="min-h-28 resize-y rounded-xl border bg-background px-3 py-2 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="例如：空间是否安静、座位是否充足、怎样找到这里…"
          onChange={(event) => {
            setContent(event.target.value);
            setError(null);
            setMessage(null);
          }}
        />
      </label>
      <p
        id={`${id}-count`}
        className="text-right text-xs text-muted-foreground"
      >
        {content.length}/2000
      </p>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm font-medium text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60"
          onClick={() => void submit()}
        >
          {pending ? "正在保存…" : feedback ? "更新我的评价" : "发布评价"}
        </button>
        {feedback ? (
          <button
            type="button"
            disabled={pending}
            className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-red-300 dark:hover:bg-red-950/40"
            onClick={() => void remove()}
          >
            <Trash2Icon aria-hidden="true" className="size-4" />
            删除我的评价
          </button>
        ) : null}
      </div>
      <p
        aria-live="polite"
        className="min-h-5 text-sm text-emerald-800 dark:text-emerald-300"
      >
        {pending ? "正在保存评价。" : message}
      </p>
    </div>
  );
}
