// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FoodMapView } from "@/components/food-map/food-map-view";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("FoodMapView", () => {
  it("renders the complete 30-minute University map by default", () => {
    render(<FoodMapView />);

    const filter = screen.getByRole("group", { name: "通勤时间" });
    expect(
      within(filter)
        .getByRole("button", { name: "30 分钟" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("img", {
        name: /大学站30分钟内可达的43个车站/,
      }),
    ).toBeTruthy();

    const stationPicker = screen.getByRole("group", { name: "选择目的地" });
    expect(within(stationPicker).getAllByRole("button")).toHaveLength(43);
    expect(
      within(stationPicker).getByRole("button", {
        name: "佐敦，30 分钟",
      }),
    ).toBeTruthy();
    expect(screen.getByText("观塘线")).toBeTruthy();
    expect(screen.getByText("荃湾线")).toBeTruthy();
    expect(screen.getByText("41 个日常目的地 + 马场特别班次")).toBeTruthy();
  });

  it("switches between the complete inclusive 10 and 20 minute bands", () => {
    render(<FoodMapView />);

    fireEvent.click(screen.getByRole("button", { name: "10 分钟" }));
    let stationPicker = screen.getByRole("group", { name: "选择目的地" });
    expect(within(stationPicker).getAllByRole("button")).toHaveLength(7);
    expect(
      within(stationPicker).getByRole("button", {
        name: "马场，8 分钟，特别班次",
      }),
    ).toBeTruthy();
    expect(
      within(stationPicker).queryByRole("button", {
        name: "九龙塘，14 分钟",
      }),
    ).toBeNull();
    expect(screen.getByText("5 个日常目的地 + 马场特别班次")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "20 分钟" }));
    stationPicker = screen.getByRole("group", { name: "选择目的地" });
    expect(within(stationPicker).getAllByRole("button")).toHaveLength(17);
    expect(
      within(stationPicker).getByRole("button", {
        name: "钻石山，20 分钟",
      }),
    ).toBeTruthy();
    expect(
      within(stationPicker).queryByRole("button", {
        name: "乐富，21 分钟",
      }),
    ).toBeNull();
    expect(
      within(stationPicker).queryByRole("button", {
        name: "石门，21 分钟",
      }),
    ).toBeNull();
  });

  it("opens the Sha Tin station summary without changing scope", () => {
    render(<FoodMapView />);

    const shaTin = screen.getByRole("button", {
      name: "沙田，7 分钟，已有餐厅候选",
    });
    fireEvent.click(shaTin);

    expect(shaTin.getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByRole("heading", { name: "沙田站附近餐厅" }),
    ).toBeTruthy();
    expect(screen.getByText("大学 → 沙田 · 7 分钟")).toBeTruthy();
    expect(screen.getByText("500m")).toBeTruthy();
    expect(screen.getAllByText("新城市茶冰厅").length).toBeGreaterThan(0);
    expect(
      screen
        .getByRole("link", { name: "打开 沙田餐厅地图" })
        .getAttribute("href"),
    ).toBe("/food-map/stations/sht");
  });

  it("shows the official shortest route to Diamond Hill", () => {
    render(<FoodMapView />);

    fireEvent.click(screen.getByRole("button", { name: "20 分钟" }));
    fireEvent.click(screen.getByRole("button", { name: "钻石山，20 分钟" }));

    expect(screen.getByText("大学 → 钻石山 · 20 分钟")).toBeTruthy();
    expect(screen.getByText("东铁线，在大围换乘屯马线")).toBeTruthy();

    const route = screen.getByRole("list", { name: "当前最短路线" });
    expect(
      within(route)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "大学到火炭，东铁线",
      "火炭到沙田，东铁线",
      "沙田到大围，东铁线",
      "大围到显径，屯马线",
      "显径到钻石山，屯马线",
    ]);
  });

  it("keeps the Kwun Tong and Tsuen Wan paths distinct", () => {
    render(<FoodMapView />);

    fireEvent.click(screen.getByRole("button", { name: "油麻地，26 分钟" }));
    expect(screen.getByText("旺角到油麻地，观塘线")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "佐敦，30 分钟" }));
    expect(
      screen.getByText("东铁线，在九龙塘换乘观塘线，在旺角换乘荃湾线"),
    ).toBeTruthy();
    expect(screen.getByText("旺角到油麻地，荃湾线")).toBeTruthy();
    expect(screen.queryByText("旺角到油麻地，观塘线")).toBeNull();
  });

  it("clears the route when the selected station is clicked again", () => {
    render(<FoodMapView />);

    const kowloonTong = screen.getByRole("button", {
      name: "九龙塘，14 分钟",
    });
    fireEvent.click(kowloonTong);
    expect(screen.getByText("大学 → 九龙塘 · 14 分钟")).toBeTruthy();

    fireEvent.click(kowloonTong);
    expect(
      screen.getByRole("heading", { name: "从地铁图选择一站" }),
    ).toBeTruthy();
    expect(screen.queryByRole("list", { name: "当前最短路线" })).toBeNull();
  });

  it("clears the route when University is clicked", () => {
    render(<FoodMapView />);

    fireEvent.click(screen.getByRole("button", { name: "九龙塘，14 分钟" }));
    fireEvent.click(screen.getByRole("button", { name: "大学，0 分钟" }));

    expect(
      screen.getByRole("heading", { name: "从地铁图选择一站" }),
    ).toBeTruthy();
    expect(screen.queryByRole("list", { name: "当前最短路线" })).toBeNull();
  });

  it("clears the route when the map background is double-clicked", () => {
    render(<FoodMapView />);

    fireEvent.click(screen.getByRole("button", { name: "九龙塘，14 分钟" }));
    fireEvent.dblClick(
      screen.getByRole("img", {
        name: /大学站30分钟内可达的43个车站/,
      }),
    );

    expect(
      screen.getByRole("heading", { name: "从地铁图选择一站" }),
    ).toBeTruthy();
    expect(screen.queryByRole("list", { name: "当前最短路线" })).toBeNull();
  });

  it("explains when a smaller budget clears the selected station", () => {
    render(<FoodMapView />);

    fireEvent.click(screen.getByRole("button", { name: "佐敦，30 分钟" }));
    fireEvent.click(screen.getByRole("button", { name: "20 分钟" }));

    expect(
      screen.getByRole("heading", { name: "从地铁图选择一站" }),
    ).toBeTruthy();
    expect(screen.getAllByText("佐敦不在20分钟范围内")).toHaveLength(2);
    expect(screen.queryByRole("list", { name: "当前最短路线" })).toBeNull();
    expect(screen.queryByRole("button", { name: "佐敦，30 分钟" })).toBeNull();
  });

  it("keeps check-in actions out of the commute map", () => {
    render(<FoodMapView />);

    expect(screen.queryByRole("button", { name: "今天吃过" })).toBeNull();
    expect(screen.queryByRole("button", { name: "今天已打卡" })).toBeNull();
  });

  it("links Tai Po Market to its own station map", () => {
    render(<FoodMapView />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "大埔墟，7 分钟，已有餐厅候选",
      }),
    );
    expect(
      screen
        .getByRole("link", { name: "打开 大埔墟餐厅地图" })
        .getAttribute("href"),
    ).toBe("/food-map/stations/tap");
  });
});
