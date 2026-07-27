/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  captureWindowScroll,
  clearPinnedWindowScroll,
  restoreWindowScroll,
  restoreWindowScrollThroughPaint,
  useRestorePinnedWindowScrollOnMount,
  useScrollPin,
} from "@/lib/pin-window-scroll";
import { act, renderHook } from "@testing-library/react";

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

    const pin = captureWindowScroll();
    expect(pin).toEqual({
      path: "/canteen/a",
      y: 320,
      token: expect.any(String),
    });
    expect(document.activeElement).not.toBe(button);
    expect(
      JSON.parse(sessionStorage.getItem("cupedia:pin-window-scroll") ?? ""),
    ).toEqual(pin);

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

  it("does not let an old clear remove a newer pin on the same route", () => {
    const oldPin = captureWindowScroll();
    const newPin = captureWindowScroll();

    clearPinnedWindowScroll(oldPin);

    expect(
      JSON.parse(sessionStorage.getItem("cupedia:pin-window-scroll") ?? ""),
    ).toEqual(newPin);
    restoreWindowScrollThroughPaint(oldPin);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("binds each release to its request and preserves a later pin", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScrollPin());
    let firstPin!: ReturnType<typeof captureWindowScroll>;
    let secondPin!: ReturnType<typeof captureWindowScroll>;
    let latestPin!: ReturnType<typeof captureWindowScroll>;
    try {
      act(() => {
        firstPin = result.current.pin();
        secondPin = result.current.pin();
        result.current.release(firstPin);
        latestPin = result.current.pin();
        result.current.release(secondPin);
        vi.runAllTimers();
      });

      expect(
        JSON.parse(sessionStorage.getItem("cupedia:pin-window-scroll") ?? ""),
      ).toEqual(latestPin);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not run queued restores after navigation", () => {
    const microtasks: Array<() => void> = [];
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      microtasks.push(callback);
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const pin = captureWindowScroll();

    restoreWindowScrollThroughPaint(pin);
    expect(scrollTo).toHaveBeenCalledTimes(1);

    window.history.replaceState(null, "", "/canteen/b");
    microtasks.forEach((callback) => callback());
    frames.forEach((callback) => callback(0));

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
