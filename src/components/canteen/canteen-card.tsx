"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import type { Canteen } from "@/lib/canteen-types";
import { cn } from "@/lib/utils";

function CanteenCardSurface({
  canteen,
  itemCount,
  children,
}: {
  canteen: Canteen;
  itemCount?: number;
  children: ReactNode;
}) {
  const { pending } = useLinkStatus();

  return (
    <span
      className={cn(
        "canteen-ledger-row group flex w-full touch-manipulation items-center gap-3 px-1 py-2.5 sm:gap-6 sm:py-4",
        pending && "bg-white/60",
      )}
      aria-busy={pending || undefined}
    >
      <span
        className={cn(
          "h-8 w-0.5 shrink-0 bg-[var(--canteen-purple)] opacity-70 transition-opacity group-hover:opacity-100 sm:h-10",
          pending && "opacity-100 group-hover:opacity-100",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <h2
          className={cn(
            "canteen-display text-base font-semibold text-[var(--canteen-ink)] sm:text-xl",
            pending
              ? "text-[var(--canteen-purple)]"
              : "group-hover:text-[var(--canteen-purple)]",
          )}
        >
          {canteen.name}
        </h2>
        {canteen.location ? (
          <p className="mt-0.5 text-xs text-[var(--canteen-muted)] sm:mt-1 sm:text-sm">
            {canteen.location}
          </p>
        ) : null}
      </span>
      {itemCount !== undefined ? (
        <span className="shrink-0 font-mono text-xs tabular-nums tracking-wide text-[var(--canteen-muted)] sm:text-sm">
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
        </span>
      ) : null}
      {pending ? (
        <span
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-[var(--canteen-line)] border-t-[var(--canteen-purple)]"
          aria-hidden
        />
      ) : (
        children
      )}
    </span>
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
        "block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canteen-purple)]",
        className,
      )}
    >
      <CanteenCardSurface canteen={canteen} itemCount={itemCount}>
        <span
          className="shrink-0 text-[var(--canteen-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--canteen-purple)]"
          aria-hidden
        >
          →
        </span>
      </CanteenCardSurface>
    </Link>
  );
}
