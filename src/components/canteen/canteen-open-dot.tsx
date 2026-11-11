"use client";

import type { CanteenOpenStatus } from "@/lib/canteen-opening-hours";
import { cn } from "@/lib/utils";

/**
 * Small status dot shown beside a canteen name.
 *
 * Colour is never the only signal: the status label is exposed to assistive
 * tech here and folded into the surrounding card's accessible name.
 */
export function CanteenOpenDot({
  status,
  className,
}: {
  status: CanteenOpenStatus;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={status.label}
      title={status.label}
      className={cn(
        "canteen-open-dot",
        `canteen-open-dot--${status.state}`,
        className,
      )}
    >
      <span className="canteen-open-dot-mark" aria-hidden />
    </span>
  );
}
