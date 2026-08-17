/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampusRouteView } from "@/components/campus-transport/campus-route-view";
import {
  toCampusBusPassengerRoute,
  type CampusBusPassengerRoute,
} from "@/lib/campus-transport/campus-bus";
import { getCampusBusRoute } from "@/lib/campus-transport/routes-data";

vi.mock("@/components/campus-transport/campus-route-map", () => ({
  CampusRouteMap: ({ route }: { route: CampusBusPassengerRoute }) => (
    <div role="region" aria-label={`${route.code} 號線地圖`} />
  ),
}));

afterEach(cleanup);

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

function renderRoute(
  routeId: string,
  initialNow: number,
  initialStopId?: string,
) {
  render(
    <CampusRouteView
      initialNow={initialNow}
      initialStopId={initialStopId}
      route={toCampusBusPassengerRoute(getCampusBusRoute(routeId)!)}
    />,
  );
}

describe("CampusRouteView", () => {
  it("renders Route 2's default stop, timetable, and passenger caveat", () => {
    renderRoute("2", Date.parse("2026-08-10T00:00:00.000Z"));

    expect(screen.getByRole("heading", { name: "2 新聯線" })).toBeTruthy();
    expect(screen.getByText("今日 07:45-18:45")).toBeTruthy();
    expect(screen.getByText(/測試預計 · 非實時車輛位置/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /善衡書院\s*S\.H\. Ho College/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText("下一班", { exact: true })).toBeTruthy();
    expect(screen.queryByText("所有中途站時間均為公開資料推算")).toBeNull();
  });

  it("shows the first departure instead of a multi-hour countdown before service", () => {
    renderRoute("1a", Date.parse("2026-08-10T17:28:00.000Z"));

    expect(
      screen
        .getByRole("button", { name: /^1\. 大學站\s*Univ\. Station$/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText("今日 07:40 開始")).toBeTruthy();
    expect(screen.queryByText("372 分鐘", { exact: true })).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "預測不準？提交實時到站時間改進預測",
      }),
    ).toBeTruthy();
  });

  it("shows Route 5 as unavailable during the official reading week", () => {
    renderRoute("5", Date.parse("2026-03-02T01:18:00.000Z"));

    expect(screen.getByRole("heading", { name: "5 上行線" })).toBeTruthy();
    expect(screen.getByText("今日不服務", { exact: true })).toBeTruthy();
    expect(screen.getByText("今日不提供 5 線服務")).toBeTruthy();
  });

  it("labels N route conditional PGH1 stops without making them universal", () => {
    renderRoute("n", Date.parse("2026-08-10T11:00:00.000Z"));

    expect(screen.getByRole("heading", { name: "N 晚間線" })).toBeTruthy();
    expect(
      screen.getByText("晚間校園環線 · 部分班次經研究生宿舍一座"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /^2\. 研究生宿舍一座\s*Postgraduate Hall 1\s*部分班次$/,
      }),
    ).toBeTruthy();
  });

  it("selects an exact operational stop occurrence from the boarding flow", () => {
    renderRoute(
      "1b",
      Date.parse("2026-08-10T23:38:00.000Z"),
      "cuhk-wp-stop-2552#2",
    );

    expect(
      screen
        .getByRole("button", { name: /8\. 大學站/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
