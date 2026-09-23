/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { CanteenOpenDot } from "@/components/canteen/canteen-open-dot";
import { CanteenCard } from "@/components/canteen/canteen-card";
import {
  CANTEEN_STATUS_CLOSED,
  CANTEEN_STATUS_OPEN,
  CANTEEN_STATUS_UNKNOWN,
  type CanteenOpeningHours,
} from "@/lib/canteen-opening-hours";

const { mockUseLinkStatus } = vi.hoisted(() => ({
  mockUseLinkStatus: vi.fn(() => ({ pending: false })),
}));

vi.mock("next/link", async () => {
  const React = await import("react");
  const MockLink = ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  return {
    __esModule: true,
    default: MockLink,
    useLinkStatus: mockUseLinkStatus,
  };
});

const BASE_CANTEEN = {
  id: "c1",
  name: "演示食堂",
  location: "演示区域",
  announcement: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

/** Open daily 08:00–20:00 HKT. */
const DAILY_0800_2000: CanteenOpeningHours = {
  kind: "weekly",
  timezone: "Asia/Hong_Kong",
  intervals: [
    { days: [0, 1, 2, 3, 4, 5, 6], opensAt: "08:00", closesAt: "20:00" },
  ],
};

beforeEach(() => {
  mockUseLinkStatus.mockReturnValue({ pending: false });
  vi.useFakeTimers();
  // Monday 12:00 HKT — inside DAILY_0800_2000.
  vi.setSystemTime(new Date("2026-03-02T12:00:00+08:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CanteenOpenDot", () => {
  it("gives each state its own modifier and text equivalent", () => {
    const { container, rerender } = render(
      <CanteenOpenDot status={CANTEEN_STATUS_OPEN} />,
    );
    expect(container.querySelector(".canteen-open-dot--open")).toBeTruthy();
    expect(screen.getByRole("img", { name: "营业中" })).toBeTruthy();

    rerender(<CanteenOpenDot status={CANTEEN_STATUS_CLOSED} />);
    expect(container.querySelector(".canteen-open-dot--closed")).toBeTruthy();
    expect(screen.getByRole("img", { name: "已打烊" })).toBeTruthy();

    rerender(<CanteenOpenDot status={CANTEEN_STATUS_UNKNOWN} />);
    expect(container.querySelector(".canteen-open-dot--unknown")).toBeTruthy();
    expect(screen.getByRole("img", { name: "营业时间未知" })).toBeTruthy();
  });
});

describe("CanteenCard open state", () => {
  it("renders no dot unless the caller opts in", () => {
    const { container } = render(
      <CanteenCard
        canteen={{ ...BASE_CANTEEN, openingHours: DAILY_0800_2000 }}
        href="/canteen/c1"
      />,
    );
    expect(container.querySelector(".canteen-open-dot")).toBeNull();
  });

  it("resolves a weekly schedule from the client clock", () => {
    render(
      <CanteenCard
        canteen={{ ...BASE_CANTEEN, openingHours: DAILY_0800_2000 }}
        href="/canteen/c1"
        showOpenState
      />,
    );
    expect(screen.getByRole("img", { name: "营业中" })).toBeTruthy();
  });

  it("reports closed outside the recorded window", () => {
    vi.setSystemTime(new Date("2026-03-02T21:00:00+08:00"));
    render(
      <CanteenCard
        canteen={{ ...BASE_CANTEEN, openingHours: DAILY_0800_2000 }}
        href="/canteen/c1"
        showOpenState
      />,
    );
    expect(screen.getByRole("img", { name: "已打烊" })).toBeTruthy();
  });

  it("reports unknown when no schedule was recorded", () => {
    render(<CanteenCard canteen={BASE_CANTEEN} href="/canteen/c1" showOpenState />);
    expect(screen.getByRole("img", { name: "营业时间未知" })).toBeTruthy();
  });

  it("folds the status into the card's accessible name", () => {
    render(
      <CanteenCard
        canteen={{ ...BASE_CANTEEN, openingHours: DAILY_0800_2000 }}
        href="/canteen/c1"
        showOpenState
      />,
    );
    expect(
      screen.getByRole("link", { name: /演示食堂.*演示区域.*营业中/ }),
    ).toBeTruthy();
  });

  it("re-checks on an interval so the dot follows the clock", () => {
    render(
      <CanteenCard
        canteen={{ ...BASE_CANTEEN, openingHours: DAILY_0800_2000 }}
        href="/canteen/c1"
        showOpenState
      />,
    );
    expect(screen.getByRole("img", { name: "营业中" })).toBeTruthy();

    vi.setSystemTime(new Date("2026-03-02T21:00:00+08:00"));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole("img", { name: "已打烊" })).toBeTruthy();
  });

  it("does not consult the clock during server render", () => {
    // 12:00 HKT is inside the window, but the server must not claim it: doing so
    // would fork markup from the client and cause a hydration mismatch.
    const html = renderToString(
      <CanteenCard
        canteen={{ ...BASE_CANTEEN, openingHours: DAILY_0800_2000 }}
        href="/canteen/c1"
        showOpenState
      />,
    );
    expect(html).toContain("营业时间未知");
    expect(html).not.toContain("营业中");
  });

  it("resolves an always-open schedule without waiting for a clock", () => {
    const html = renderToString(
      <CanteenCard
        canteen={{ ...BASE_CANTEEN, openingHours: { kind: "always" } }}
        href="/canteen/c1"
        showOpenState
      />,
    );
    expect(html).toContain("营业中");
  });
});
