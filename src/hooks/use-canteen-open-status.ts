"use client";

import { useHktNow } from "@/hooks/use-hkt-clock";
import {
  canteenOpenStatusForClock,
  type CanteenOpenStatus,
  type CanteenOpeningHours,
} from "@/lib/canteen-opening-hours";

/**
 * Resolve open state for one canteen on the client.
 *
 * Returns `null` when the caller did not ask for open state, so callers can skip
 * rendering a status entirely.
 */
export function useCanteenOpenStatus(
  openingHours: CanteenOpeningHours | null | undefined,
  enabled: boolean,
): CanteenOpenStatus | null {
  const now = useHktNow(enabled);
  return enabled ? canteenOpenStatusForClock(openingHours, now) : null;
}
