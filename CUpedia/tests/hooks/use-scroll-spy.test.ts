/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrollSpy } from "@/hooks/use-scroll-spy";

let observeCallback: IntersectionObserverCallback;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
  mockObserve.mockClear();
  mockDisconnect.mockClear();

  class MockIntersectionObserver {
    constructor(cb: IntersectionObserverCallback) {
      observeCallback = cb;
    }
    observe = mockObserve;
    disconnect = mockDisconnect;
    unobserve = vi.fn();
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

describe("useScrollSpy", () => {
  it("returns null when no heading IDs provided", () => {
    const { result } = renderHook(() => useScrollSpy([]));
    expect(result.current).toBeNull();
  });

  it("returns the active heading ID when observer fires", () => {
    vi.spyOn(document, "getElementById").mockImplementation(
      (id) => ({ id }) as HTMLElement,
    );

    const { result } = renderHook(() =>
      useScrollSpy(["section-one", "section-two"]),
    );

    act(() => {
      observeCallback(
        [
          { target: { id: "section-one" }, isIntersecting: true },
        ] as unknown as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      );
    });

    expect(result.current).toBe("section-one");
  });

  it("disconnects observer on unmount", () => {
    vi.spyOn(document, "getElementById").mockImplementation(
      (id) => ({ id }) as HTMLElement,
    );

    const { unmount } = renderHook(() => useScrollSpy(["section-one"]));

    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
