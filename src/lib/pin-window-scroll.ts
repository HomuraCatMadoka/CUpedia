"use client";

import { useLayoutEffect, useRef, type DependencyList } from "react";

const PIN_SCROLL_KEY = "cupedia:pin-window-scroll";

/** Blur focus (avoids scroll-into-view) and remember scrollY. */
export function captureWindowScroll(): number {
  if (typeof window === "undefined") return 0;
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
  const y = window.scrollY;
  try {
    sessionStorage.setItem(PIN_SCROLL_KEY, String(y));
  } catch {
    // private mode / disabled storage
  }
  return y;
}

export function restoreWindowScroll(y: number): void {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: y, left: 0, behavior: "instant" });
}

/** Restore now and after the next paint (DOM reorder / router refresh). */
export function restoreWindowScrollThroughPaint(y: number): void {
  restoreWindowScroll(y);
  queueMicrotask(() => restoreWindowScroll(y));
  requestAnimationFrame(() => restoreWindowScroll(y));
}

export function clearPinnedWindowScroll(): void {
  try {
    sessionStorage.removeItem(PIN_SCROLL_KEY);
  } catch {
    // ignore
  }
}

/** After server-action remount, put the viewport back. */
export function useRestorePinnedWindowScrollOnMount(): void {
  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(PIN_SCROLL_KEY);
      if (raw == null) return;
      sessionStorage.removeItem(PIN_SCROLL_KEY);
      const y = Number(raw);
      if (Number.isFinite(y)) restoreWindowScroll(y);
    } catch {
      // ignore
    }
  }, []);
}

/**
 * While `pinnedScrollY` is set, keep window.scrollY after dependency changes
 * (e.g. ranking reorder).
 */
export function usePinnedWindowScroll(
  pinnedScrollY: { current: number | null },
  deps: DependencyList,
): void {
  useLayoutEffect(() => {
    const y = pinnedScrollY.current;
    if (y == null) return;
    restoreWindowScroll(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller owns deps
  }, deps);
}

export function useScrollPin() {
  const pinnedScrollY = useRef<number | null>(null);

  function pin() {
    pinnedScrollY.current = captureWindowScroll();
  }

  function release() {
    const y = pinnedScrollY.current;
    if (y != null) restoreWindowScrollThroughPaint(y);
    pinnedScrollY.current = null;
    // Leave sessionStorage briefly for a possible remount; clear shortly after.
    window.setTimeout(() => clearPinnedWindowScroll(), 1000);
  }

  return { pinnedScrollY, pin, release };
}
