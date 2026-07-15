import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Canteen } from "@/lib/canteen-types";

export function CanteenShell({
  eyebrow,
  title,
  subtitle,
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
        "mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10",
        className,
      )}
    >
      {backHref ? (
        <div className="canteen-fade-in mb-4">
          <Link
            href={backHref}
            className="canteen-back-link"
            aria-label={backLabel}
          >
            <ArrowLeft className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="sr-only sm:not-sr-only">{backLabel}</span>
          </Link>
        </div>
      ) : null}
      <header className="canteen-fade-in mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          {eyebrow ? (
            typeof eyebrow === "string" ? (
              <p className="text-xs font-medium tracking-[0.18em] text-[var(--canteen-muted)]">
                {eyebrow}
              </p>
            ) : (
              <div className="text-sm text-[var(--canteen-muted)]">{eyebrow}</div>
            )
          ) : null}
          <h1
            className={cn(
              "text-[var(--canteen-ink)]",
              brandTitle
                ? "canteen-brand text-4xl sm:text-5xl"
                : "canteen-display text-3xl font-semibold tracking-tight sm:text-4xl",
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={cn(
                "max-w-xl leading-relaxed text-[var(--canteen-muted)]",
                brandTitle ? "text-base sm:text-lg" : "text-sm sm:text-base",
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function CanteenCard({
  canteen,
  itemCount,
  href,
  className,
}: {
  canteen: Canteen;
  itemCount?: number;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "canteen-ledger-row group flex items-center gap-4 px-1 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canteen-purple)] sm:gap-6",
        className,
      )}
    >
      <span
        className="h-10 w-0.5 shrink-0 bg-[var(--canteen-purple)] opacity-70 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <h2 className="canteen-display text-lg font-semibold text-[var(--canteen-ink)] group-hover:text-[var(--canteen-purple)] sm:text-xl">
          {canteen.name}
        </h2>
        {canteen.location ? (
          <p className="mt-1 text-sm text-[var(--canteen-muted)]">
            {canteen.location}
          </p>
        ) : null}
      </div>
      {itemCount !== undefined ? (
        <p className="shrink-0 font-mono text-xs tabular-nums tracking-wide text-[var(--canteen-muted)] sm:text-sm">
          {itemCount > 0 ? (
            <>
              <span className="text-[var(--canteen-ink)]">
                {String(itemCount).padStart(2, "0")}
              </span>{" "}
              道菜
            </>
          ) : (
            "暂无菜单"
          )}
        </p>
      ) : null}
      <span
        className="shrink-0 text-[var(--canteen-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--canteen-purple)]"
        aria-hidden
      >
        →
      </span>
    </Link>
  );
}

export function PreviewBanner() {
  return (
    <div
      role="status"
      className="mb-6 border border-[var(--canteen-morning)]/35 bg-[var(--canteen-morning)]/10 px-4 py-3 text-sm text-[var(--canteen-ink)]"
    >
      <span className="font-medium">演示模式</span>
      <span className="text-[var(--canteen-muted)]">
        {" "}
        — 数据保存在内存中，无需数据库。正式管理请使用{" "}
        <Link
          href="/admin/canteens"
          className="text-[var(--canteen-purple)] underline underline-offset-2"
        >
          管理后台
        </Link>
        。
      </span>
    </div>
  );
}
