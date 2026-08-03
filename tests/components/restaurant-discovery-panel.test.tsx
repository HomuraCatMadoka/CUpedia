// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RestaurantDiscoveryPanel } from "@/components/food-map/restaurant-discovery-panel";
import { FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY } from "@/lib/food-map/candidate-decisions";
import { MTR_STATIONS } from "@/lib/food-map/data";

const shaTin = MTR_STATIONS.find((station) => station.id === "SHT")!;
const university = MTR_STATIONS.find((station) => station.id === "UNI")!;
const foTan = MTR_STATIONS.find((station) => station.id === "FOT")!;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("RestaurantDiscoveryPanel", () => {
  it("shows station and commute context with several restaurant cards", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={20} notice={null} />,
    );

    expect(screen.getByText("沙田站附近")).toBeTruthy();
    expect(
      screen.getByText("20 分钟范围 · 港铁 7 分钟 · 4 家餐厅"),
    ).toBeTruthy();
    expect(screen.getByText("新城市茶冰厅")).toBeTruthy();
    expect(screen.getByText("大学至沙田 · 7 分钟")).toBeTruthy();
    expect(screen.getByText("4 分钟")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "下一家餐厅" }));
    expect(screen.getByText("城河米线")).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "想吃" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });

  it("opens details without creating a candidate decision", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByText("查看资料不会改变你的想吃或略过选择。"),
    ).toBeTruthy();
    expect(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stores button decisions and lets the latest explicit choice win", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    const save = screen.getByRole("button", { name: "想吃" });
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(save);
    expect(screen.getByText("城河米线")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "上一家餐厅" }));
    expect(screen.getByLabelText("当前状态：已想吃")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "略过" }));
    const stored = JSON.parse(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY) ??
        "{}",
    );
    expect(stored.byRestaurantId["sht-mock-meal"].decision).toBe("passed");
  });

  it("keeps candidate decisions while the commute scope changes", async () => {
    const { rerender } = render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    const save = screen.getByRole("button", { name: "想吃" });
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(save);

    rerender(
      <RestaurantDiscoveryPanel station={shaTin} budget={10} notice={null} />,
    );
    expect(
      screen.getByText("10 分钟范围 · 港铁 7 分钟 · 4 家餐厅"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "上一家餐厅" }));
    expect(screen.getByLabelText("当前状态：已想吃")).toBeTruthy();
  });

  it("maps left and right swipes to the same decisions as the buttons", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "想吃" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );

    let card = screen.getByTestId("restaurant-card");
    fireEvent.pointerDown(card, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 180,
      clientY: 200,
    });
    fireEvent.pointerMove(card, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 80,
      clientY: 204,
    });
    fireEvent.pointerUp(card, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 80,
      clientY: 204,
    });

    let stored = JSON.parse(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY) ??
        "{}",
    );
    expect(stored.byRestaurantId["sht-mock-meal"].decision).toBe("passed");

    card = screen.getByTestId("restaurant-card");
    fireEvent.pointerDown(card, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 80,
      clientY: 200,
    });
    fireEvent.pointerUp(card, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 180,
      clientY: 204,
    });
    stored = JSON.parse(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY) ??
        "{}",
    );
    expect(stored.byRestaurantId["foodle-sht-002"].decision).toBe("saved");
  });

  it("does not turn vertical touch movement into a decision", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "想吃" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );

    const card = screen.getByTestId("restaurant-card");
    fireEvent.pointerDown(card, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 120,
      clientY: 100,
    });
    fireEvent.pointerMove(card, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 145,
      clientY: 190,
    });
    fireEvent.pointerUp(card, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 145,
      clientY: 190,
    });

    expect(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY),
    ).toBeNull();
  });

  it("labels missing restaurant facts instead of rendering zero values", () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    const next = screen.getByRole("button", { name: "下一家餐厅" });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);

    expect(screen.getByText("橙路咖啡")).toBeTruthy();
    expect(screen.getByText("营业时间资料暂缺")).toBeTruthy();
    expect(screen.getAllByText("资料暂缺").length).toBeGreaterThanOrEqual(2);
  });

  it("renders explicit unselected, no-restaurant, campus and out-of-scope states", () => {
    const { rerender } = render(
      <RestaurantDiscoveryPanel station={null} budget={30} notice={null} />,
    );
    expect(screen.getByText("从地铁图选择一站")).toBeTruthy();

    rerender(
      <RestaurantDiscoveryPanel station={foTan} budget={30} notice={null} />,
    );
    expect(screen.getByText("火炭暂未收录餐厅")).toBeTruthy();

    rerender(
      <RestaurantDiscoveryPanel
        station={university}
        budget={30}
        notice={null}
      />,
    );
    expect(screen.getByText("校内餐厅在食堂页")).toBeTruthy();

    rerender(
      <RestaurantDiscoveryPanel
        station={null}
        budget={10}
        notice="佐敦不在10分钟范围内"
      />,
    );
    expect(screen.getByText("当前范围已更新")).toBeTruthy();
    expect(screen.getByText("佐敦不在10分钟范围内")).toBeTruthy();
  });
});
