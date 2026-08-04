// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FoodMapView } from "@/components/food-map/food-map-view";
import { FOOD_MAP_CHECKINS_STORAGE_KEY } from "@/lib/food-map/checkins";
import {
  FOODLE_PENDING_INTENT_STORAGE_KEY,
  serializeFoodlePendingIntent,
} from "@/lib/food-map/pending-intent";
import { emptyFoodlePersonalState } from "@/lib/food-map/personal-state";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("FoodMapView", () => {
  it("restores an interrupted Foodle scope and restaurant after login", async () => {
    window.localStorage.setItem(
      FOODLE_PENDING_INTENT_STORAGE_KEY,
      serializeFoodlePendingIntent({
        version: 1,
        restaurantId: "sht-mock-meal",
        decision: "saved",
        budget: 20,
        stationId: "SHT",
        createdAt: new Date().toISOString(),
      }),
    );

    render(
      <FoodMapView
        personalSnapshot={{
          kind: "authenticated",
          state: emptyFoodlePersonalState(),
        }}
      />,
    );

    const filter = screen.getByRole("group", { name: "通勤时间" });
    await waitFor(() =>
      expect(
        within(filter)
          .getByRole("button", { name: "20 分钟" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(
      await screen.findByRole("heading", { name: "沙田站 · 20 分钟范围" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "新城市茶冰厅" })).toBeTruthy();
    expect(
      window.localStorage.getItem(FOODLE_PENDING_INTENT_STORAGE_KEY),
    ).toBeNull();
  });

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
        name: "佐敦，油尖旺区，30 分钟，已有餐厅候选",
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
        name: "马场，沙田区，8 分钟，特别班次",
      }),
    ).toBeTruthy();
    expect(
      within(stationPicker).queryByRole("button", {
        name: "九龙塘，九龙城区，14 分钟，已有餐厅候选",
      }),
    ).toBeNull();
    expect(screen.getByText("5 个日常目的地 + 马场特别班次")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "20 分钟" }));
    stationPicker = screen.getByRole("group", { name: "选择目的地" });
    expect(within(stationPicker).getAllByRole("button")).toHaveLength(17);
    expect(
      within(stationPicker).getByRole("button", {
        name: "钻石山，黄大仙区，20 分钟",
      }),
    ).toBeTruthy();
    expect(
      within(stationPicker).queryByRole("button", {
        name: "乐富，黄大仙区，21 分钟",
      }),
    ).toBeNull();
    expect(
      within(stationPicker).queryByRole("button", {
        name: "石门，沙田区，21 分钟",
      }),
    ).toBeNull();
  });

  it("opens an independent discovery surface and hides the map from assistive tech", async () => {
    render(<FoodMapView />);

    const shaTin = screen.getByRole("button", {
      name: "沙田，沙田区，7 分钟，已有餐厅候选",
    });
    expect(shaTin.style.width).toBe("44px");
    expect(shaTin.style.height).toBe("44px");
    fireEvent.click(shaTin);

    expect(shaTin.getAttribute("aria-current")).toBe("true");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "打开 Foodle Match，沙田站 · 30 分钟范围，4 家餐厅",
      }),
    );
    expect(
      screen.getByRole("region", { name: "Foodle Match 餐厅发现" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "沙田站 · 30 分钟范围" }),
    ).toBeTruthy();
    expect(screen.getByText("本轮 4 家 · 港铁 7 分钟")).toBeTruthy();
    expect(screen.getAllByText("新城市茶冰厅").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", {
        name: "佐敦，油尖旺区，30 分钟，已有餐厅候选",
      }),
    ).toBeNull();
    expect(document.body.children[0].getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps an open discovery batch isolated from later map station changes", async () => {
    render(<FoodMapView />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "沙田，沙田区，7 分钟，已有餐厅候选",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "打开 Foodle Match，沙田站 · 30 分钟范围，4 家餐厅",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "沙田站 · 30 分钟范围" }),
    ).toBeTruthy();

    const backgroundKowloonTong = document.querySelector<HTMLButtonElement>(
      '[data-station-id="KOT"]',
    );
    expect(backgroundKowloonTong).toBeTruthy();
    fireEvent.click(backgroundKowloonTong!);

    expect(
      screen.getByRole("region", { name: "Foodle Match 餐厅发现" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "沙田站 · 30 分钟范围" }),
    ).toBeTruthy();
  });

  it("shows the official shortest route to Diamond Hill", () => {
    render(<FoodMapView />);

    fireEvent.click(screen.getByRole("button", { name: "20 分钟" }));
    fireEvent.click(
      screen.getByRole("button", { name: "钻石山，黄大仙区，20 分钟" }),
    );

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

    fireEvent.click(
      screen.getByRole("button", { name: "油麻地，油尖旺区，26 分钟" }),
    );
    expect(screen.getByText("旺角到油麻地，观塘线")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "佐敦，油尖旺区，30 分钟，已有餐厅候选",
      }),
    );
    expect(
      screen.getByText("东铁线，在九龙塘换乘观塘线，在旺角换乘荃湾线"),
    ).toBeTruthy();
    expect(screen.getByText("旺角到油麻地，荃湾线")).toBeTruthy();
    expect(screen.queryByText("旺角到油麻地，观塘线")).toBeNull();
  });

  it("clears the route when the selected station is clicked again", () => {
    render(<FoodMapView />);

    const kowloonTong = screen.getByRole("button", {
      name: "九龙塘，九龙城区，14 分钟，已有餐厅候选",
    });
    fireEvent.click(kowloonTong);
    expect(screen.getByText("大学 → 九龙塘 · 14 分钟")).toBeTruthy();

    fireEvent.click(kowloonTong);
    expect(screen.getByText("大学 · 0 分钟")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "当前最短路线" })).toBeNull();
    expect(screen.queryByRole("button", { name: "返回总览" })).toBeNull();
  });

  it("clears the route when University is clicked", () => {
    render(<FoodMapView />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "九龙塘，九龙城区，14 分钟，已有餐厅候选",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "大学，沙田区，0 分钟" }),
    );

    expect(screen.getByText("大学 · 0 分钟")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "当前最短路线" })).toBeNull();
  });

  it("clears the route when the map background is double-clicked", () => {
    render(<FoodMapView />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "九龙塘，九龙城区，14 分钟，已有餐厅候选",
      }),
    );
    fireEvent.dblClick(
      screen.getByRole("img", {
        name: /大学站30分钟内可达的43个车站/,
      }),
    );

    expect(screen.getByText("大学 · 0 分钟")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "当前最短路线" })).toBeNull();
  });

  it("explains when a smaller budget clears the selected station", () => {
    render(<FoodMapView />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "佐敦，油尖旺区，30 分钟，已有餐厅候选",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "20 分钟" }));

    expect(screen.getByText("大学 · 0 分钟")).toBeTruthy();
    expect(screen.getAllByText("佐敦不在20分钟范围内")).toHaveLength(2);
    expect(screen.queryByRole("list", { name: "当前最短路线" })).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "佐敦，油尖旺区，30 分钟，已有餐厅候选",
      }),
    ).toBeNull();
  });

  it("shows district context on the map, legend and detail panel", () => {
    render(<FoodMapView />);

    const legend = screen.getByRole("group", { name: "地区图例" });
    expect(within(legend).getByText("沙田区")).toBeTruthy();
    expect(within(legend).getByText("九龙城区")).toBeTruthy();
    expect(within(legend).getByText("中西区")).toBeTruthy();

    const map = screen.getByRole("img", {
      name: /大学站30分钟内可达的43个车站/,
    });
    expect(map.querySelectorAll("[data-district-polygon]")).toHaveLength(16);
    expect(map.querySelector('[data-district-polygon="ktc"]')).toBeTruthy();
    // 南区/离岛区被画布边缘切断，按用户决定不渲染（边缘裁净）
    expect(map.querySelector('[data-district-polygon="sd"]')).toBeNull();
    expect(map.querySelector('[data-district-polygon="is"]')).toBeNull();
    expect(screen.getByText("维多利亚港")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "何文田，九龙城区，25 分钟" }),
    );
    expect(screen.getAllByText("九龙城区 · 何文田").length).toBeGreaterThan(0);
    expect(screen.getByText("大学 → 何文田 · 25 分钟")).toBeTruthy();

    const popup = screen.getByRole("status", { name: "选中车站" });
    expect(within(popup).getByText("何文田")).toBeTruthy();
    expect(within(popup).getByText(/九龙城区 · 何文田/)).toBeTruthy();
    expect(within(popup).getByText(/25 分钟/)).toBeTruthy();
  });

  it("does not render sub-district bubbles", () => {
    render(<FoodMapView />);

    // 小地区气泡已全部下线（用户反馈与站名重合挡视线）
    const map = screen.getByRole("img", {
      name: /大学站30分钟内可达的43个车站/,
    });
    const mapTexts = [...map.querySelectorAll("text")].map(
      (node) => node.textContent,
    );
    expect(mapTexts).not.toContain("马料水");
    expect(mapTexts).not.toContain("湾仔北");
    expect(mapTexts).not.toContain("尖沙咀");
  });

  it("zooms with the wheel and reframes on budget change", () => {
    render(<FoodMapView />);

    const map = screen.getByRole("img", {
      name: /大学站30分钟内可达的43个车站/,
    });
    const initial = map.getAttribute("viewBox") ?? "";
    expect(initial).not.toBe("");
    const initialWidth = Number(initial.split(" ")[2]);
    expect(initialWidth).toBeGreaterThan(0);

    fireEvent.wheel(map, { deltaY: -100 });
    const zoomed = (map.getAttribute("viewBox") ?? "").split(" ").map(Number);
    expect(zoomed[2]).toBeLessThan(initialWidth);

    fireEvent.wheel(map, { deltaY: 100 });
    const filter = screen.getByRole("group", { name: "通勤时间" });
    fireEvent.click(within(filter).getByRole("button", { name: "20 分钟" }));
    const reframed = screen.getByRole("img", {
      name: /大学站20分钟内可达的17个车站/,
    });
    expect(reframed.getAttribute("viewBox")).not.toBe(initial);
  });

  it("narrows the district legend with the commute budget", () => {
    render(<FoodMapView />);

    fireEvent.click(screen.getByRole("button", { name: "10 分钟" }));
    const legend = screen.getByRole("group", { name: "地区图例" });
    expect(within(legend).getByText("沙田区")).toBeTruthy();
    expect(within(legend).getByText("大埔区")).toBeTruthy();
    expect(within(legend).queryByText("中西区")).toBeNull();
    expect(within(legend).queryByText("油尖旺区")).toBeNull();
  });

  it("stores a one-tap check-in for today", async () => {
    render(<FoodMapView />);

    const checkIn = await screen.findByRole("button", { name: "今天吃过" });
    await waitFor(() =>
      expect((checkIn as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(checkIn);

    expect(
      screen
        .getByRole("button", { name: "今天已打卡" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      window.localStorage.getItem(FOOD_MAP_CHECKINS_STORAGE_KEY),
    ).toContain("university-tea-counter");
  });

  it("keeps a station check-in while changing budget and selection", async () => {
    render(<FoodMapView />);

    fireEvent.click(
      screen.getByRole("button", { name: "钻石山，黄大仙区，20 分钟" }),
    );
    const checkIn = await screen.findByRole("button", { name: "今天吃过" });
    await waitFor(() =>
      expect((checkIn as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(checkIn);

    fireEvent.click(screen.getByRole("button", { name: "10 分钟" }));
    fireEvent.click(screen.getByRole("button", { name: "30 分钟" }));
    fireEvent.click(
      screen.getByRole("button", { name: "钻石山，黄大仙区，20 分钟" }),
    );

    expect(
      screen
        .getByRole("button", { name: "今天已打卡" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("moves check-ins to the new Hong Kong date after midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T15:59:59Z"));
    render(<FoodMapView />);
    act(() => vi.runOnlyPendingTimers());

    fireEvent.click(screen.getByRole("button", { name: "今天吃过" }));

    vi.setSystemTime(new Date("2026-07-26T16:00:00Z"));
    fireEvent.focus(window);
    fireEvent.click(screen.getByRole("button", { name: "今天吃过" }));

    expect(
      JSON.parse(
        window.localStorage.getItem(FOOD_MAP_CHECKINS_STORAGE_KEY) ?? "{}",
      ).byDate,
    ).toEqual({
      "2026-07-26": ["university-tea-counter"],
      "2026-07-27": ["university-tea-counter"],
    });
  });
});
