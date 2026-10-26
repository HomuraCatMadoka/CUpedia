"use client";

import { useSyncExternalStore } from "react";

/**
 * Clock resolution for time-derived canteen UI.
 *
 * Everything the canteen UI derives from "now" lands on a minute boundary, so
 * subscribing at minute resolution is enough and keeps the snapshot stable
 * across every `getSnapshot` call within a minute.
 */
export const HKT_CLOCK_TICK_MS = 60_000;

function subscribeToMinute(onStoreChange: () => void): () => void {
  const timer = window.setInterval(onStoreChange, HKT_CLOCK_TICK_MS);
  return () => window.clearInterval(timer);
}

const noopSubscribe = () => () => {};

function getMinuteSnapshot(): number {
  return Math.floor(Date.now() / HKT_CLOCK_TICK_MS);
}

/** Sentinel meaning "no clock here"; keeps the server frame clock-independent. */
function getServerMinuteSnapshot(): null {
  return null;
}

/**
 * Current instant, or `null` before this client has a clock.
 *
 * The clock is exactly the kind of external store `useSyncExternalStore` exists
 * for, and going through it keeps the first frame deterministic: the server
 * snapshot carries no clock, so server and hydration markup agree. Deciding
 * canteen state from the RSC timezone is forbidden
 * (`.cursor/rules/canteen.mdc`), and reading the clock during render would fork
 * the markup and cause a hydration mismatch
 * (see `docs/canteen/LESSONS-187-188.md`).
 *
 * Pass `enabled: false` when the caller will not use the value, so no timer is
 * created at all.
 */
export function useHktNow(enabled = true): Date | null {
  const minute = useSyncExternalStore(
    enabled ? subscribeToMinute : noopSubscribe,
    getMinuteSnapshot,
    getServerMinuteSnapshot,
  );

  return minute === null ? null : new Date(minute * HKT_CLOCK_TICK_MS);
}
