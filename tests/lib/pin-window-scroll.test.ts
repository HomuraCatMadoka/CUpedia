/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  captureWindowScroll,
  clearPinnedWindowScroll,
  restoreWindowScroll,
  useRestorePinnedWindowScrollOnMount,
} from "@/lib/pin-window-scroll";
import { renderHook } from "@testing-library/react";

describe("pin-window-scroll", () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    scrollTo.mockReset();
    sessionStorage.clear();
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => 320,
    });
    window.scrollTo = scrollTo as typeof window.scrollTo;
    window.history.replaceState(null, "", "/canteen/a");
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("captures scrollY, blurs focus, and stores a pin for remounts", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);

    expect(captureWindowScroll()).toBe(320);
    expect(document.activeElement).not.toBe(button);
    expect(
      JSON.parse(sessionStorage.getItem("cupedia:pin-window-scroll") ?? ""),
    ).toEqual({ path: "/canteen/a", y: 320 });

    restoreWindowScroll(320);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 320,
      left: 0,
      behavior: "instant",
    });

    clearPinnedWindowScroll();
    expect(sessionStorage.getItem("cupedia:pin-window-scroll")).toBeNull();
    button.remove();
  });

  it("does not restore a scroll pin captured on another route", () => {
    captureWindowScroll();
    window.history.replaceState(null, "", "/canteen/b");

    renderHook(() => useRestorePinnedWindowScrollOnMount());

    expect(scrollTo).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("cupedia:pin-window-scroll")).toBeNull();
  });
});
