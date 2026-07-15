/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { PrefetchLink } from "@/components/layout/prefetch-link";

const { mockPrefetch } = vi.hoisted(() => ({ mockPrefetch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: mockPrefetch }),
}));

beforeEach(() => {
  mockPrefetch.mockClear();
  cleanup();
});

describe("PrefetchLink intent prefetch (#137, #317)", () => {
  it("prefetches the route the first time the link is hovered", () => {
    const { getByText } = render(
      <PrefetchLink href="/wiki/guide/canteen">食堂攻略</PrefetchLink>,
    );
    fireEvent.mouseEnter(getByText("食堂攻略"));
    expect(mockPrefetch).toHaveBeenCalledExactlyOnceWith("/wiki/guide/canteen");
  });

  it("does not prefetch again on repeated hover", () => {
    const { getByText } = render(
      <PrefetchLink href="/wiki/guide">校园指南</PrefetchLink>,
    );
    const link = getByText("校园指南");
    fireEvent.mouseEnter(link);
    fireEvent.mouseEnter(link);
    fireEvent.mouseEnter(link);
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
  });

  it("prefetches on touch pointerdown and deduplicates later pointer and hover events", () => {
    const { getByText } = render(
      <PrefetchLink href="/wiki/guide">校园指南</PrefetchLink>,
    );
    const link = getByText("校园指南");
    fireEvent.pointerDown(link, { pointerType: "touch" });
    fireEvent.pointerDown(link, { pointerType: "touch" });
    fireEvent.mouseEnter(link);
    expect(mockPrefetch).toHaveBeenCalledExactlyOnceWith("/wiki/guide");
  });

  it("leaves mouse pointerdown to the existing hover intent path", () => {
    const { getByText } = render(
      <PrefetchLink href="/wiki/guide">校园指南</PrefetchLink>,
    );
    fireEvent.pointerDown(getByText("校园指南"), { pointerType: "mouse" });
    expect(mockPrefetch).not.toHaveBeenCalled();
  });

  it("does not prefetch before hover — keeps idle navigation traffic off", () => {
    render(<PrefetchLink href="/wiki/guide">校园指南</PrefetchLink>);
    expect(mockPrefetch).not.toHaveBeenCalled();
  });
});
