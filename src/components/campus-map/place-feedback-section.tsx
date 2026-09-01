"use client";

import { StarIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PlaceFeedbackForm } from "@/components/campus-map/place-feedback-form";
import { PlaceFeedbackModerationControls } from "@/components/campus-map/place-feedback-moderation-controls";
import type {
  CampusMapPlaceFeedbackPage,
  CampusMapPlaceFeedbackView,
} from "@/lib/campus-map/place-feedback";

function feedbackDate(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

export function PlaceFeedbackSection({
  placeId,
  feedback,
  viewerFeedback,
  viewerCanWrite,
  isAdmin,
}: {
  placeId: string;
  feedback: CampusMapPlaceFeedbackPage;
  viewerFeedback: CampusMapPlaceFeedbackView | null;
  viewerCanWrite: boolean;
  isAdmin: boolean;
}) {
  const [localSnapshot, setLocalSnapshot] = useState<{
    base: CampusMapPlaceFeedbackPage;
    current: CampusMapPlaceFeedbackPage;
  } | null>(null);
  const [sectionMessage, setSectionMessage] = useState<string | null>(null);
  const snapshot =
    localSnapshot?.base === feedback ? localSnapshot.current : feedback;
  const applySnapshot = (nextSnapshot: CampusMapPlaceFeedbackPage) =>
    setLocalSnapshot({ base: feedback, current: nextSnapshot });

  const summary = snapshot.summary;
  const readOnly = snapshot.placeStatus !== "active";
  return (
    <section
      id="place-feedback"
      className="scroll-mt-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
      aria-labelledby="place-feedback-title"
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 id="place-feedback-title" className="text-lg font-semibold">
            评分与评价
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            分享真实的到访体验；地点资料修改仍走独立的公开编辑流程。
          </p>
        </div>
        {summary.averageRating === null ? (
          <p className="text-sm font-semibold text-muted-foreground">
            暂无评分
          </p>
        ) : (
          <p
            className="inline-flex items-center gap-2 text-sm"
            aria-label={`平均 ${summary.averageRating.toFixed(1)} 分，共 ${summary.ratingCount} 个评分、${summary.reviewCount} 条文字评价`}
          >
            <StarIcon
              aria-hidden="true"
              className="size-5 fill-amber-500 text-amber-600"
            />
            <strong className="text-xl">
              {summary.averageRating.toFixed(1)}
            </strong>
            <span className="text-muted-foreground">
              {summary.ratingCount} 个评分 · {summary.reviewCount} 条评价
            </span>
          </p>
        )}
      </div>

      <div className="mt-5">
        {viewerCanWrite || readOnly ? (
          <PlaceFeedbackForm
            key={`${placeId}:${viewerFeedback?.id ?? "new"}:${viewerFeedback?.version ?? 0}:${readOnly ? "read-only" : "write"}`}
            placeId={placeId}
            initialFeedback={viewerFeedback}
            readOnly={readOnly}
            onSnapshot={(nextSnapshot) => {
              applySnapshot(nextSnapshot);
              setSectionMessage(null);
            }}
          />
        ) : (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            公开评分和评价可直接阅读。
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/campus-map/places/${placeId}#place-feedback`)}`}
              className="ml-1 font-semibold text-foreground underline underline-offset-4"
            >
              登录后评分或写评价
            </Link>
            。
          </p>
        )}
      </div>

      <div className="mt-7">
        <h3 className="font-semibold">公开评价</h3>
        {snapshot.page.items.length > 0 ? (
          <ol className="mt-3 grid gap-3">
            {snapshot.page.items.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border bg-background p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm">{item.author.nickname}</strong>
                    <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
                      <StarIcon
                        aria-hidden="true"
                        className="size-4 fill-current"
                      />
                      {item.rating} 星
                    </p>
                  </div>
                  <time
                    dateTime={item.updatedAt}
                    className="text-xs text-muted-foreground"
                  >
                    {feedbackDate(item.updatedAt)}
                    {item.updatedAt !== item.createdAt ? " 更新" : ""}
                  </time>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                  {item.content}
                </p>
                <PlaceFeedbackModerationControls
                  feedbackId={item.id}
                  isAdmin={isAdmin}
                  onSnapshot={(nextSnapshot) => {
                    applySnapshot(nextSnapshot);
                    setSectionMessage("评价已隐藏。");
                  }}
                />
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 rounded-xl bg-muted px-4 py-5 text-sm text-muted-foreground">
            还没有公开文字评价。你可以只评分，也可以写下第一条体验。
          </p>
        )}
        <nav aria-label="评价分页" className="mt-4 flex flex-wrap gap-3">
          {snapshot.page.isPaginated ? (
            <Link
              href={`/campus-map/places/${placeId}#place-feedback`}
              className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              返回最新评价
            </Link>
          ) : null}
          {snapshot.page.nextCursor ? (
            <Link
              href={`/campus-map/places/${placeId}?reviewsAfter=${encodeURIComponent(snapshot.page.nextCursor)}#place-feedback`}
              className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              查看下一页评价
            </Link>
          ) : null}
        </nav>
        <p
          aria-live="polite"
          className="mt-2 min-h-5 text-sm text-emerald-800 dark:text-emerald-300"
        >
          {sectionMessage}
        </p>
      </div>
    </section>
  );
}
