"use client";

import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";

import {
  getActiveProductNavigationId,
  PRODUCT_NAVIGATION,
} from "@/lib/product-navigation";
import { cn } from "@/lib/utils";

export function ProductNavigationLinks({
  pathname,
  onClick,
  onNavigate,
  pendingHref = null,
  feedbackHref = null,
  className,
}: {
  pathname: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onNavigate?: () => void;
  pendingHref?: string | null;
  feedbackHref?: string | null;
  className?: string;
}) {
  const activeProductId = getActiveProductNavigationId(pathname);

  return (
    <nav
      aria-label="CUpedia 产品"
      className={cn(
        "min-h-0 touch-pan-y overflow-y-auto overscroll-contain px-4 py-3",
        className,
      )}
    >
      {PRODUCT_NAVIGATION.map((item) => {
        const active = item.id === activeProductId;
        const pending = pendingHref === item.href;
        const showFeedback = feedbackHref === item.href;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-disabled={pending || undefined}
            aria-busy={showFeedback || undefined}
            aria-label={
              showFeedback
                ? `${item.label}，正在打开`
                : item.status
                  ? `${item.label} · ${item.status}`
                  : undefined
            }
            onClick={(event) => onClick?.(event, item.href)}
            onNavigate={onNavigate}
            className={cn(
              "flex min-h-14 touch-manipulation items-center justify-between gap-4 rounded-xl px-3 text-xl font-semibold tracking-[-0.025em] transition-[background-color,color,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
              active
                ? "bg-[#5b2a73]/10 text-[#5b2a73] dark:bg-purple-300/15 dark:text-purple-200"
                : "text-foreground hover:bg-accent",
              pending && "pointer-events-none opacity-70",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span>{item.label}</span>
              {item.status && (
                <span className="shrink-0 rounded-full bg-[#5b2a73]/10 px-2 py-1 text-[11px] leading-none font-semibold text-[#5b2a73] dark:bg-purple-300/15 dark:text-purple-200">
                  {item.status}
                </span>
              )}
            </span>
            {showFeedback ? (
              <LoaderCircleIcon
                data-testid="product-navigation-pending"
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
              />
            ) : (
              <ChevronRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
