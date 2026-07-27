/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  captureWindowScroll,
  clearPinnedWindowScroll,
  restoreWindowScroll,
} from "@/lib/pin-window-scroll";

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
    expect(sessionStorage.getItem("cupedia:pin-window-scroll")).toBe("320");

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
});
