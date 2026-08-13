/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CampusBusBoardingPlacePicker } from "@/components/campus-transport/campus-bus-boarding-place-picker";
import { toCampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import { getCampusBusRoute } from "@/lib/campus-transport/routes-data";

afterEach(cleanup);

describe("CampusBusBoardingPlacePicker", () => {
  it("selects a place and shows route departures without requesting geolocation", () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    render(
      <CampusBusBoardingPlacePicker
        initialNow={Date.UTC(2026, 7, 10, 23, 38)}
        routes={[toCampusBusPassengerRoute(getCampusBusRoute("1a")!)]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選擇乘車地點" }));
    fireEvent.change(screen.getByLabelText("搜尋乘車地點"), {
      target: { value: "大學站" },
    });
    fireEvent.click(screen.getByRole("button", { name: /大學站/ }));

    expect(screen.getByRole("heading", { name: "大學站" })).toBeTruthy();
    expect(screen.getAllByText("本部線").length).toBeGreaterThan(0);
    expect(screen.queryByText("1A 本部線")).toBeNull();
    expect(screen.getAllByText(/起點開出/).length).toBeGreaterThan(0);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("shows a safe empty result", () => {
    render(
      <CampusBusBoardingPlacePicker
        initialNow={Date.UTC(2026, 7, 10, 23, 38)}
        routes={[toCampusBusPassengerRoute(getCampusBusRoute("1a")!)]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選擇乘車地點" }));
    fireEvent.change(screen.getByLabelText("搜尋乘車地點"), {
      target: { value: "不存在" },
    });

    expect(
      screen.getByText("找不到相符乘車地點，請嘗試其他名稱。"),
    ).toBeTruthy();
  });
});
