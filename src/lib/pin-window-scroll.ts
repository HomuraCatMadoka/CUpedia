"use client";

import { useLayoutEffect, useRef, type DependencyList } from "react";

const PIN_SCROLL_KEY = "cupedia:pin-window-scroll";
export type ScrollPin = { path: string; y: number; token: string };

function readScrollPin(): ScrollPin | null {
  try {
    const raw = sessionStorage.getItem(PIN_SCROLL_KEY);
    if (raw == null) return null;
    const pin = JSON.parse(raw) as Partial<ScrollPin>;
    return typeof pin.path === "string" &&
      Number.isFinite(pin.y) &&
      typeof pin.token === "string"
      ? { path: pin.path, y: pin.y as number, token: pin.token }
      : null;
  } catch {
    return null;
  }
}

/** Blur focus (avoids scroll-into-view) and remember scrollY. */
export function captureWindowScroll(): ScrollPin {
  if (typeof window === "undefined") return { path: "", y: 0, token: "" };
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
  const pin = {
    path: window.location.pathname,
    y: window.scrollY,
    token: crypto.randomUUID(),
  };
  try {
    sessionStorage.setItem(PIN_SCROLL_KEY, JSON.stringify(pin));
  } catch {
    // private mode / disabled storage
  }
  return pin;
}

export function restoreWindowScroll(y: number): void {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: y, left: 0, behavior: "instant" });
}

function restoreCurrentPin(pin: ScrollPin): void {
  if (window.location.pathname !== pin.path) return;
  const stored = readScrollPin();
  if (stored && stored.token !== pin.token) return;
  restoreWindowScroll(pin.y);
}

/** Restore now and after the next paint while still on the captured route. */
export function restoreWindowScrollThroughPaint(pin: ScrollPin): void {
  restoreCurrentPin(pin);
  queueMicrotask(() => restoreCurrentPin(pin));
  requestAnimationFrame(() => restoreCurrentPin(pin));
}

export function clearPinnedWindowScroll(expectedPin?: ScrollPin): void {
  try {
    const pin = readScrollPin();
    if (
      expectedPin &&
      (pin?.path !== expectedPin.path || pin.token !== expectedPin.token)
    ) {
      return;
    }
    sessionStorage.removeItem(PIN_SCROLL_KEY);
  } catch {
    // ignore
  }
}

/** After server-action remount, put the viewport back. */
export function useRestorePinnedWindowScrollOnMount(): void {
  useLayoutEffect(() => {
    try {
      const pin = readScrollPin();
      sessionStorage.removeItem(PIN_SCROLL_KEY);
      if (pin?.path === window.location.pathname) restoreWindowScroll(pin.y);
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
  pinnedScroll: { current: ScrollPin | null },
  deps: DependencyList,
): void {
  useLayoutEffect(() => {
    const pin = pinnedScroll.current;
    if (pin == null || pin.path !== window.location.pathname) return;
    restoreWindowScroll(pin.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller owns deps
  }, deps);
}

export function useScrollPin() {
  const pinnedScroll = useRef<ScrollPin | null>(null);

  function pin() {
    const captured = captureWindowScroll();
    pinnedScroll.current = captured;
    return captured;
  }

  function release(captured: ScrollPin) {
    restoreWindowScrollThroughPaint(captured);
    if (pinnedScroll.current?.token === captured.token) {
      pinnedScroll.current = null;
    }
    // Leave sessionStorage briefly for a possible remount; clear shortly after.
    window.setTimeout(() => clearPinnedWindowScroll(captured), 1000);
  }

  return { pinnedScroll, pin, release };
}
