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
  variant = "default",
}: {
  pathname: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onNavigate?: () => void;
  pendingHref?: string | null;
  feedbackHref?: string | null;
  className?: string;
  variant?: "default" | "wiki";
}) {
  const activeProductId = getActiveProductNavigationId(pathname);
  const wikiVariant = variant === "wiki";

  return (
    <nav
      aria-label="CUpedia 产品"
      className={cn(
        "min-h-0 touch-pan-y overflow-y-auto overscroll-contain px-4 py-3",
        wikiVariant && "px-2 py-2",
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
              wikiVariant &&
                "relative min-h-12 gap-3 rounded-md px-3 text-[15px] font-medium tracking-normal",
              active && !wikiVariant
                ? "bg-[#5b2a73]/10 text-[#5b2a73] dark:bg-purple-300/15 dark:text-purple-200"
                : !wikiVariant && "text-foreground hover:bg-accent",
              active && wikiVariant
                ? "bg-[#5b2a73]/[0.08] font-semibold text-[#2c2c2b] before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-[#5b2a73] dark:bg-purple-300/10 dark:text-purple-100 dark:before:bg-purple-300"
                : wikiVariant &&
                    "text-[#5f5e5a] hover:bg-[#eeeceb] hover:text-[#2c2c2b] dark:text-[#c7c7cc] dark:hover:bg-white/10 dark:hover:text-white",
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
