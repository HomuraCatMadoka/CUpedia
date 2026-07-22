"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";
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
        "canteen-ledger-row group flex w-full touch-manipulation items-center gap-4 px-1 py-4 sm:gap-6",
        pending && "bg-white/60",
      )}
      aria-busy={pending || undefined}
    >
      <span
        className={cn(
          "h-10 w-0.5 shrink-0 bg-[var(--canteen-purple)] opacity-70",
          pending && "opacity-100",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "canteen-display block text-lg font-semibold text-[var(--canteen-ink)] sm:text-xl",
            pending
              ? "text-[var(--canteen-purple)]"
              : "group-hover:text-[var(--canteen-purple)]",
          )}
        >
          {canteen.name}
        </span>
        {canteen.location ? (
          <span className="mt-1 block text-sm text-[var(--canteen-muted)]">
            {canteen.location}
          </span>
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
  const router = useRouter();
  const prefetched = useRef(false);

  const prefetchOnce = () => {
    if (prefetched.current) return;
    prefetched.current = true;
    router.prefetch(href);
  };

  return (
    <Link
      href={href}
      onMouseEnter={prefetchOnce}
      onFocus={prefetchOnce}
      // Desktop + mobile: start partial prefetch on press, before click navigates.
      onPointerDown={prefetchOnce}
      className={cn(
        "block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--canteen-purple)]",
        className,
      )}
      aria-label={`进入${canteen.name}`}
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
