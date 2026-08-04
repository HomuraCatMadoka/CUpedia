import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export { CanteenCard } from "@/components/canteen/canteen-card";

export function CanteenShell({
  eyebrow,
  title,
  subtitle,
  announcement,
  topContent,
  children,
  action,
  className,
  brandTitle = false,
  backHref,
  backLabel = "返回",
}: {
  eyebrow?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Plain notice under the title (no border/box). */
  announcement?: string | null;
  /** Optional live content between the back control and page identity. */
  topContent?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** When true, title renders as brand wordmark (山城食记). */
  brandTitle?: boolean;
  /** Top-left back control; omit to hide. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 max-w-5xl px-3 py-3 sm:px-6 sm:py-10",
        className,
      )}
    >
      {backHref ? (
        <div className="canteen-fade-in mb-4 hidden sm:block">
          <Link
            href={backHref}
            className="canteen-back-link"
            aria-label={backLabel}
          >
            <ArrowLeft
              className="size-5 shrink-0"
              strokeWidth={2.25}
              aria-hidden
            />
            <span>{backLabel}</span>
          </Link>
        </div>
      ) : null}
      <div className={cn(topContent && "canteen-detail-hero")}>
        <header
          className={cn(
            "canteen-fade-in",
            topContent ? "canteen-detail-identity" : "mb-3 sm:mb-6",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 items-start gap-3 sm:gap-4",
              brandTitle ? "sm:items-center" : null,
            )}
          >
            <div className="min-w-0 flex-1">
              {eyebrow ? (
                typeof eyebrow === "string" ? (
                  <p className="mb-1 text-xs font-medium tracking-[0.18em] text-[var(--canteen-muted)]">
                    {eyebrow}
                  </p>
                ) : (
                  <div className="mb-1 text-sm text-[var(--canteen-muted)]">
                    {eyebrow}
                  </div>
                )
              ) : null}
              <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                {backHref ? (
                  <div className="shrink-0 sm:hidden">
                    <Link
                      href={backHref}
                      className="canteen-back-link"
                      aria-label={backLabel}
                    >
                      <ArrowLeft
                        className="size-5 shrink-0"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                      <span className="sr-only">{backLabel}</span>
                    </Link>
                  </div>
                ) : null}
                <h1
                  className={cn(
                    "min-w-0 truncate text-[var(--canteen-ink)] sm:overflow-visible sm:whitespace-normal",
                    brandTitle
                      ? "canteen-brand text-2xl leading-tight sm:text-5xl sm:leading-tight"
                      : "canteen-display text-2xl font-semibold tracking-tight leading-tight sm:text-4xl sm:leading-tight",
                  )}
                >
                  {title}
                </h1>
              </div>
              {topContent && (subtitle || announcement) ? (
                <p
                  role={announcement ? "status" : undefined}
                  className={cn(
                    "canteen-detail-meta mt-1 flex min-w-0 max-w-xl items-start gap-1.5 text-xs leading-5",
                    backHref ? "max-sm:pl-10" : null,
                  )}
                >
                  {subtitle ? (
                    <span className="shrink-0 font-medium text-[var(--canteen-muted)]">
                      {subtitle}
                    </span>
                  ) : null}
                  {subtitle && announcement ? (
                    <span
                      aria-hidden
                      className="text-[var(--canteen-muted)]/55"
                    >
                      ·
                    </span>
                  ) : null}
                  {announcement ? (
                    <span className="line-clamp-2 min-w-0 text-[var(--canteen-ink)]/75 sm:line-clamp-1">
                      {announcement}
                    </span>
                  ) : null}
                </p>
              ) : (
                <>
                  {subtitle ? (
                    <p
                      className={cn(
                        "max-w-xl leading-snug text-[var(--canteen-muted)]",
                        backHref ? "max-sm:pl-10" : null,
                        brandTitle
                          ? "mt-2 text-xs sm:mt-3 sm:text-lg"
                          : "mt-2 text-xs sm:mt-2.5 sm:text-base",
                      )}
                    >
                      {subtitle}
                    </p>
                  ) : null}
                  {announcement ? (
                    <p
                      role="status"
                      className={cn(
                        "mt-1.5 max-w-xl whitespace-pre-wrap text-xs leading-snug text-[var(--canteen-ink)]/80 sm:mt-2 sm:text-sm sm:leading-snug",
                        backHref ? "max-sm:pl-10" : null,
                      )}
                    >
                      {announcement}
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
          </div>
        </header>
        {topContent ? (
          <div className="canteen-detail-live">{topContent}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function PreviewBanner() {
  return (
    <div
      role="status"
      className="mb-6 border border-[var(--canteen-morning)]/35 bg-[var(--canteen-morning)]/10 px-4 py-3 text-sm text-[var(--canteen-ink)]"
    >
      <p>
        <span className="font-medium">演示模式</span>
        <span className="text-[var(--canteen-muted)]">
          {" "}
          — 数据在内存中。完整管理（含评论审核）请用管理后台：
        </span>
      </p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/admin/canteens"
          className="text-[var(--canteen-link)] underline underline-offset-2"
        >
          食堂 / 公告
        </Link>
        <Link
          href="/admin/comments"
          className="text-[var(--canteen-link)] underline underline-offset-2"
        >
          评论管理
        </Link>
        <Link
          href="/admin/danmaku"
          className="text-[var(--canteen-link)] underline underline-offset-2"
        >
          弹幕管理
        </Link>
      </p>
    </div>
  );
}
