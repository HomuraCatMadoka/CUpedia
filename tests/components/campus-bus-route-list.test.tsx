/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampusBusRouteList } from "@/components/campus-transport/campus-bus-route-list";
import { toCampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import { campusBusRoutes } from "@/lib/campus-transport/routes-data";

const routes = campusBusRoutes.map(toCampusBusPassengerRoute);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CampusBusRouteList", () => {
  it("lists every reviewed passenger route and links Route 3", () => {
    const now = Date.parse("2026-08-10T00:00:00.000Z");
    vi.setSystemTime(now);
    render(<CampusBusRouteList initialNow={now} routes={routes} />);

    expect(screen.getByRole("heading", { name: "現在可乘" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "其他路線" })).toBeTruthy();
    for (const route of [
      "1A 本部線",
      "1B 本部線",
      "2 新聯線",
      "3 逸夫線",
      "4 環迴線",
      "5 上行線",
      "6A 下行線 (敬文)",
      "6B 下行線 (新聯)",
      "7 下行線 (逸夫)",
      "N 晚間線",
      "H 假日線",
    ]) {
      expect(screen.getByRole("link", { name: route })).toBeTruthy();
    }
    expect(
      screen.getByRole("link", { name: "3 逸夫線" }).getAttribute("href"),
    ).toBe("/campus-bus/3");
  });

  it("offers the full catalog when no bus is currently running", () => {
    const now = Date.parse("2026-08-09T17:00:00.000Z");
    vi.setSystemTime(now);
    render(<CampusBusRouteList initialNow={now} routes={routes} />);

    expect(
      screen.getByText("目前沒有行駛中的校巴，其他今日路線仍可在下方查看。"),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "其他路線" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /1A 本部線/ })).toBeTruthy();
  });
});
