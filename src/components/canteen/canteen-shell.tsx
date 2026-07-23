import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export { CanteenCard } from "@/components/canteen/canteen-card";

export function CanteenShell({
  eyebrow,
  title,
  subtitle,
  announcement,
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
      <header className="canteen-fade-in mb-3 flex flex-col gap-1.5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-0.5 sm:space-y-3">
          {eyebrow ? (
            typeof eyebrow === "string" ? (
              <p className="text-xs font-medium tracking-[0.18em] text-[var(--canteen-muted)]">
                {eyebrow}
              </p>
            ) : (
              <div className="text-sm text-[var(--canteen-muted)]">
                {eyebrow}
              </div>
            )
          ) : null}
          <div className="flex min-w-0 items-center gap-1 sm:block">
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
                  ? "canteen-brand text-2xl sm:text-5xl"
                  : "canteen-display text-xl font-semibold tracking-tight sm:text-4xl",
              )}
            >
              {title}
            </h1>
          </div>
          {subtitle ? (
            <p
              className={cn(
                "max-w-xl leading-snug text-[var(--canteen-muted)] sm:leading-relaxed",
                backHref ? "max-sm:pl-10" : null,
                brandTitle ? "text-xs sm:text-lg" : "text-xs sm:text-base",
              )}
            >
              {subtitle}
            </p>
          ) : null}
          {announcement ? (
            <p
              role="status"
              className={cn(
                "max-w-xl whitespace-pre-wrap text-xs leading-snug text-[var(--canteen-ink)]/80 sm:text-base sm:leading-relaxed",
                backHref ? "max-sm:pl-10" : null,
              )}
            >
              {announcement}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
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
          className="text-[var(--canteen-purple)] underline underline-offset-2"
        >
          食堂 / 公告
        </Link>
        <Link
          href="/admin/comments"
          className="text-[var(--canteen-purple)] underline underline-offset-2"
        >
          评论管理
        </Link>
        <Link
          href="/admin/danmaku"
          className="text-[var(--canteen-purple)] underline underline-offset-2"
        >
          弹幕管理
        </Link>
      </p>
    </div>
  );
}
