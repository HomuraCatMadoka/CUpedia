import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Canteen } from "@/lib/canteen-types";

export function CanteenShell({
  eyebrow,
  title,
  subtitle,
  children,
  action,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10", className)}>
      <header className="canteen-fade-in mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          {eyebrow ? (
            typeof eyebrow === "string" ? (
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--canteen-muted)]">
                {eyebrow}
              </p>
            ) : (
              <div className="text-sm text-[var(--canteen-muted)]">{eyebrow}</div>
            )
          ) : null}
          <h1 className="canteen-display text-3xl font-semibold tracking-tight text-[var(--canteen-ink)] sm:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-xl text-sm leading-relaxed text-[var(--canteen-muted)] sm:text-base">
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
        "canteen-steam group relative block overflow-hidden rounded-2xl border border-[var(--canteen-bamboo)]/25 bg-white/70 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--canteen-purple)]/30 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canteen-purple)]",
        className,
      )}
    >
      <div
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[var(--canteen-morning)] via-[var(--canteen-noon)] to-[var(--canteen-evening)] opacity-80 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      <div className="pl-3">
        <h2 className="canteen-display text-xl font-semibold text-[var(--canteen-ink)] group-hover:text-[var(--canteen-purple)]">
          {canteen.name}
        </h2>
        {canteen.location ? (
          <p className="mt-1 text-sm text-[var(--canteen-muted)]">{canteen.location}</p>
        ) : null}
        {itemCount !== undefined ? (
          <p className="mt-3 text-xs font-medium tracking-wide text-[var(--canteen-bamboo)]">
            {itemCount > 0 ? `${itemCount} 道菜品` : "暂无菜单"}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function PreviewBanner() {
  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-amber-300/60 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
    >
      <span className="font-medium">演示模式</span>
      <span className="text-amber-900/80">
        {" "}
        — 数据保存在内存中，无需数据库。正式管理请使用{" "}
        <Link href="/admin/canteens" className="underline underline-offset-2">
          管理后台
        </Link>
        。
      </span>
    </div>
  );
}
