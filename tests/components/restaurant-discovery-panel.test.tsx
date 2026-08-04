// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { migrateLocalState, saveDecision, saveMatchResult } = vi.hoisted(() => ({
  migrateLocalState: vi.fn(),
  saveDecision: vi.fn(),
  saveMatchResult: vi.fn(),
}));

vi.mock("@/lib/food-map/personal-state-actions", () => ({
  migrateFoodleLocalStateAction: migrateLocalState,
  saveFoodleCandidateDecisionAction: saveDecision,
  saveFoodleMatchResultAction: saveMatchResult,
}));

import { RestaurantDiscoveryPanel } from "@/components/food-map/restaurant-discovery-panel";
import { FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY } from "@/lib/food-map/candidate-decisions";
import { MTR_STATIONS } from "@/lib/food-map/data";
import { FOODLE_MATCH_STORAGE_KEY } from "@/lib/food-map/match";
import { emptyFoodlePersonalState } from "@/lib/food-map/personal-state";

const shaTin = MTR_STATIONS.find((station) => station.id === "SHT")!;
const university = MTR_STATIONS.find((station) => station.id === "UNI")!;
const taiPoMarket = MTR_STATIONS.find((station) => station.id === "TAP")!;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function openEntry(label: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: label }));
  const save = screen.queryByRole("button", { name: "想吃" });
  if (save) {
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false),
    );
  }
}

describe("RestaurantDiscoveryPanel", () => {
  it("keeps anonymous discovery read-only until login is confirmed", async () => {
    render(
      <RestaurantDiscoveryPanel
        station={shaTin}
        budget={20}
        notice={null}
        personalSnapshot={{ kind: "anonymous" }}
      />,
    );
    await openEntry(/打开 Foodle Match，沙田站 · 20 分钟范围，4 家餐厅/u);
    const restaurantName = screen.getByRole("heading", {
      level: 3,
    }).textContent;

    fireEvent.click(screen.getByRole("button", { name: "想吃" }));

    const dialog = await screen.findByRole("dialog", { name: "登录后继续" });
    expect(within(dialog).getByText(/尚未提交/u)).toBeTruthy();
    expect(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY),
    ).toBeNull();
    expect(saveDecision).not.toHaveBeenCalled();

    const login = within(dialog).getByRole("link", { name: "登录并继续" });
    expect(login.getAttribute("href")).toBe("/login?next=%2Ffood-map");
    login.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(login);
    expect(
      JSON.parse(
        window.localStorage.getItem("cupedia:foodle-pending-intent:v1") ?? "{}",
      ).restaurantId,
    ).toBe("sht-mock-meal");

    fireEvent.click(within(dialog).getByRole("button", { name: "继续浏览" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "登录后继续" })).toBeNull(),
    );
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(
      restaurantName,
    );
  });

  it("renders authenticated choices from the account snapshot", async () => {
    const state = emptyFoodlePersonalState();
    state.decisions.byRestaurantId["sht-mock-meal"] = {
      decision: "saved",
      decidedAt: "2026-08-04T00:00:00.000Z",
    };

    render(
      <RestaurantDiscoveryPanel
        station={shaTin}
        budget={20}
        notice={null}
        personalSnapshot={{ kind: "authenticated", state }}
      />,
    );

    expect(await screen.findByText("想吃 1")).toBeTruthy();
    expect(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY),
    ).toBeNull();
    await openEntry(/打开 Foodle Match，沙田站 · 20 分钟范围，3 家餐厅/u);
    expect(
      screen.getByRole("region", { name: "Foodle Match 餐厅发现" }),
    ).toBeTruthy();
  });

  it("asks before mixing legacy local records into an account", async () => {
    window.localStorage.setItem(
      FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        byRestaurantId: {
          "sht-mock-meal": {
            decision: "saved",
            decidedAt: "2026-08-04T00:00:00.000Z",
          },
        },
      }),
    );
    window.localStorage.setItem(
      FOODLE_MATCH_STORAGE_KEY,
      JSON.stringify({ version: 1, result: null }),
    );
    render(
      <RestaurantDiscoveryPanel
        station={shaTin}
        budget={20}
        notice={null}
        personalSnapshot={{
          kind: "authenticated",
          state: emptyFoodlePersonalState(),
        }}
      />,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "处理本机 Foodle 记录",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "暂不处理" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "处理本机 Foodle 记录" }),
      ).toBeNull(),
    );
    expect(screen.getByText("想吃 0")).toBeTruthy();
    expect(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY),
    ).not.toBeNull();
    expect(migrateLocalState).not.toHaveBeenCalled();
  });

  it("surfaces stale catalog data without blocking discovery", async () => {
    render(
      <RestaurantDiscoveryPanel
        station={shaTin}
        budget={20}
        notice={null}
        catalogState="stale"
      />,
    );

    expect(await screen.findByText("餐厅资料可能已过期")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /打开 Foodle Match，沙田站 · 20 分钟范围/u,
      }),
    ).toBeTruthy();
  });

  it.each([
    ["empty" as const, "当前范围没有餐厅资料", "status"],
    ["failed" as const, "餐厅资料暂时无法载入", "alert"],
  ])(
    "keeps a %s catalog from opening an empty discovery dead end",
    async (catalogState, message, role) => {
      render(
        <RestaurantDiscoveryPanel
          station={shaTin}
          budget={20}
          notice={null}
          catalogState={catalogState}
        />,
      );

      expect(
        (await screen.findByRole(role, { name: "" })).textContent,
      ).toContain(message);
      const entry = screen.getByRole("button", {
        name: /Foodle Match 暂不可用/u,
      });
      expect((entry as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(entry);
      expect(
        screen.queryByRole("region", { name: "Foodle Match 餐厅发现" }),
      ).toBeNull();
    },
  );

  it("keeps restaurant facts browsable when personal state is unavailable", async () => {
    render(
      <RestaurantDiscoveryPanel
        station={shaTin}
        budget={20}
        notice={null}
        personalSnapshot={{
          kind: "unavailable",
          message: "个人选择暂时无法读取",
        }}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "个人选择暂时无法读取",
    );
    expect(screen.getByText("想吃 —")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: /打开 Foodle Match，沙田站 · 20 分钟范围，4 家餐厅/u,
      }),
    );
    const restaurantName = screen.getByRole("heading", {
      level: 3,
    }).textContent;

    expect(
      (screen.getByRole("button", { name: "想吃" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "想吃" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "个人选择暂时无法读取",
    );
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(
      restaurantName,
    );
    expect(saveDecision).not.toHaveBeenCalled();
  });

  it("exposes discovery as a modal surface and closes it with Escape", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={20} notice={null} />,
    );
    const entry = await screen.findByRole("button", {
      name: /打开 Foodle Match，沙田站 · 20 分钟范围/u,
    });
    fireEvent.click(entry);

    const surface = screen.getByRole("dialog", { name: "餐厅发现" });
    expect(surface.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(surface, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Foodle Match 餐厅发现" }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", {
          name: /打开 Foodle Match，沙田站 · 20 分钟范围/u,
        }),
      ),
    );
  });

  it("opens an independent eight-card Match batch from the commute scope", async () => {
    render(
      <RestaurantDiscoveryPanel station={null} budget={20} notice={null} />,
    );

    await openEntry(/打开 Foodle Match，20 分钟范围，8 家餐厅/u);

    expect(
      screen.getByRole("region", { name: "Foodle Match 餐厅发现" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "20 分钟范围" })).toBeTruthy();
    expect(screen.getByText("本轮 8 家")).toBeTruthy();
  });

  it("keeps saved restaurants in a dedicated candidate surface", async () => {
    render(
      <RestaurantDiscoveryPanel station={null} budget={20} notice={null} />,
    );
    await openEntry(/打开 Foodle Match，20 分钟范围，8 家餐厅/u);
    const restaurantName = screen.getByRole("heading", {
      level: 3,
    }).textContent;
    fireEvent.click(screen.getByRole("button", { name: "想吃" }));

    fireEvent.click(screen.getByRole("button", { name: "查看想吃候选，1 家" }));
    expect(screen.getByRole("heading", { name: "想吃候选" })).toBeTruthy();
    expect(screen.getByText(restaurantName!)).toBeTruthy();
  });

  it("keeps station and MTR context visible while browsing details", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={20} notice={null} />,
    );
    await openEntry(/打开 Foodle Match，沙田站 · 20 分钟范围，4 家餐厅/u);

    expect(
      screen.getByRole("heading", { name: "沙田站 · 20 分钟范围" }),
    ).toBeTruthy();
    expect(screen.getByText("本轮 4 家 · 港铁 7 分钟")).toBeTruthy();
    const card = within(screen.getByTestId("restaurant-card"));
    expect(card.getByText("港铁 7 分钟")).toBeTruthy();
    expect(card.getByText("步行 4 分钟")).toBeTruthy();
    expect(card.getByText("Foodle 58 次打卡")).toBeTruthy();
    expect(card.queryByText("到访人数")).toBeNull();

    fireEvent.click(card.getByRole("button", { name: "查看餐厅详情" }));
    const dialog = within(screen.getByRole("dialog", { name: "新城市茶冰厅" }));
    expect(dialog.getByText("到访人数")).toBeTruthy();
    expect(
      screen.getByText("查看资料不会改变你的想吃或略过选择。"),
    ).toBeTruthy();
    expect(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY),
    ).toBeNull();
  });

  it("lets the latest explicit saved or passed decision win", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    await openEntry(/打开 Foodle Match，沙田站 · 30 分钟范围，4 家餐厅/u);
    const restaurantName = screen.getByRole("heading", {
      level: 3,
    }).textContent!;
    fireEvent.click(screen.getByRole("button", { name: "想吃" }));
    fireEvent.click(screen.getByRole("button", { name: "查看想吃候选，1 家" }));
    fireEvent.click(
      screen.getByRole("button", { name: `取消想吃：${restaurantName}` }),
    );

    const stored = JSON.parse(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY) ??
        "{}",
    );
    expect(stored.byRestaurantId["sht-mock-meal"].decision).toBe("passed");
    expect(screen.getByText("还没有想吃候选")).toBeTruthy();
  });

  it("keeps saved decisions when the commute scope changes", async () => {
    const { rerender } = render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    await openEntry(/打开 Foodle Match，沙田站 · 30 分钟范围，4 家餐厅/u);
    fireEvent.click(screen.getByRole("button", { name: "想吃" }));
    fireEvent.click(screen.getByRole("button", { name: "返回通勤地图" }));

    rerender(
      <RestaurantDiscoveryPanel station={shaTin} budget={10} notice={null} />,
    );
    expect(screen.getByText("想吃 1")).toBeTruthy();
  });

  it("shows an explicit empty state when every saved restaurant is outside the current scope", async () => {
    window.localStorage.setItem(
      FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        byRestaurantId: {
          "sht-mock-meal": {
            decision: "saved",
            decidedAt: "2026-08-04T00:00:00.000Z",
          },
        },
      }),
    );
    render(
      <RestaurantDiscoveryPanel
        station={taiPoMarket}
        budget={30}
        notice={null}
      />,
    );

    await openEntry(/打开 Foodle Match，大埔墟站 · 30 分钟范围，4 家餐厅/u);
    fireEvent.click(screen.getByRole("button", { name: "查看想吃候选，1 家" }));

    expect(screen.getByText("此范围没有想吃候选")).toBeTruthy();
    expect(screen.getByText("范围外 1 家仍保留在想吃候选。")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /开始 Match|从 .* 家想吃候选/u }),
    ).toBeNull();
  });

  it("maps left and right swipes to passed and saved decisions", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    await openEntry(/打开 Foodle Match，沙田站 · 30 分钟范围，4 家餐厅/u);

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

    const stored = JSON.parse(
      window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY) ??
        "{}",
    );
    expect(stored.byRestaurantId["sht-mock-meal"].decision).toBe("passed");
    expect(stored.byRestaurantId["foodle-sht-002"].decision).toBe("saved");
  });

  it("does not turn vertical touch movement into a decision", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    await openEntry(/打开 Foodle Match，沙田站 · 30 分钟范围，4 家餐厅/u);

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

  it("shows missing source and Foodle facts instead of zero values", async () => {
    render(
      <RestaurantDiscoveryPanel
        station={taiPoMarket}
        budget={30}
        notice={null}
      />,
    );
    await openEntry(/打开 Foodle Match，大埔墟站 · 30 分钟范围，4 家餐厅/u);
    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "略过" }));
    }

    expect(screen.getByRole("heading", { name: "铁路旁烘焙室" })).toBeTruthy();
    expect(screen.getByText("菜系资料暂缺")).toBeTruthy();
    expect(screen.getAllByText("资料暂缺").length).toBeGreaterThanOrEqual(3);
  });

  it("shows gallery controls only when more than one source image exists", async () => {
    render(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    await openEntry(/打开 Foodle Match，沙田站 · 30 分钟范围，4 家餐厅/u);

    expect(screen.getByRole("button", { name: "下一张餐厅插画" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "略过" }));
    expect(screen.queryByRole("button", { name: "下一张餐厅插画" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "略过" }));
    expect(screen.getByTestId("restaurant-illustration-fallback")).toBeTruthy();
  });

  it("renders zero, exhausted and outside-current-scope states", async () => {
    const { rerender } = render(
      <RestaurantDiscoveryPanel
        station={university}
        budget={30}
        notice={null}
      />,
    );
    await openEntry(/打开 Foodle Match，大学站 · 30 分钟范围，0 家餐厅/u);
    expect(screen.getByText("这个范围暂时没有餐厅")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "返回通勤地图" }));

    rerender(
      <RestaurantDiscoveryPanel station={shaTin} budget={30} notice={null} />,
    );
    await openEntry(/打开 Foodle Match，沙田站 · 30 分钟范围，4 家餐厅/u);
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "略过" }));
    }
    expect(screen.getByText("本轮 4 家看完了")).toBeTruthy();
  });
});
