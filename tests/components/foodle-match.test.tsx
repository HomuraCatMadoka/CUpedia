// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FoodleMatch } from "@/components/food-map/foodle-match";
import {
  emptyFoodleMatchStore,
  FOODLE_MATCH_STORAGE_KEY,
  saveFoodleMatchResult,
  serializeFoodleMatchStore,
} from "@/lib/food-map/match";
import { FOODLE_RESTAURANTS } from "@/lib/food-map/restaurant-catalog";

const candidates = FOODLE_RESTAURANTS.slice(0, 4);
const stableRandom = () => 0.999;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderMatch(candidateCount: number) {
  return render(
    <FoodleMatch
      candidates={candidates.slice(0, candidateCount)}
      sourceLabel="20 分钟范围"
      ready
      random={stableRandom}
      initialSide="left"
    />,
  );
}

describe("FoodleMatch", () => {
  it("does not open a Match from an empty saved-candidate surface", () => {
    renderMatch(0);

    expect(screen.queryByRole("button", { name: /开始 Match/u })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("turns one candidate into an explicit single result", async () => {
    renderMatch(1);
    const restaurant = candidates[0];

    fireEvent.click(
      await screen.findByRole("button", {
        name: `选择这家：${restaurant.sourceFacts.name}`,
      }),
    );

    const dialog = screen.getByRole("dialog", { name: "Foodle Match" });
    expect(within(dialog).getByText("只有这家候选")).toBeTruthy();
    expect(
      within(dialog).getByRole("heading", {
        name: restaurant.sourceFacts.name,
      }),
    ).toBeTruthy();
    expect(within(dialog).queryByTestId("match-comparison")).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "再选一次" }),
    ).toBeNull();
    expect(within(dialog).queryByText("Match 完成")).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem(FOODLE_MATCH_STORAGE_KEY) ?? "{}")
        .result.mode,
    ).toBe("single");
  });

  it("uses one comparison round for two candidates without 1 / 1 progress", async () => {
    renderMatch(2);
    fireEvent.click(
      await screen.findByRole("button", { name: "从 2 家想吃候选开始 Match" }),
    );

    const comparison = screen.getByTestId("match-comparison");
    expect(within(comparison).queryByText(/第 1 \/ 1 轮/u)).toBeNull();
    fireEvent.click(
      within(comparison).getByRole("button", {
        name: `选择 ${candidates[0].sourceFacts.name}`,
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("match-result")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "再选一次" })).toBeTruthy();
  });

  it("keeps both direct choice actions in the Foodle purple treatment", async () => {
    renderMatch(2);
    fireEvent.click(
      await screen.findByRole("button", { name: "从 2 家想吃候选开始 Match" }),
    );

    const actions = screen.getByRole("group", { name: "选择餐厅" });
    for (const button of within(actions).getAllByRole("button")) {
      expect(button.className).toContain("border-[#672d7e]");
      expect(button.className).toContain("text-[#672d7e]");
    }
  });

  it("locks both choices during the transition and restores keyboard focus to the champion", async () => {
    renderMatch(3);
    fireEvent.click(
      await screen.findByRole("button", { name: "从 3 家想吃候选开始 Match" }),
    );

    const chosen = screen.getByRole("button", {
      name: `选择 ${candidates[0].sourceFacts.name}`,
    });
    fireEvent.click(chosen, { detail: 0 });

    const actions = screen.getByRole("group", { name: "选择餐厅" });
    expect(actions.getAttribute("aria-busy")).toBe("true");
    expect(
      within(actions)
        .getAllByRole("button")
        .every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(
      screen
        .getByTestId("match-left-candidate")
        .getAttribute("data-match-state"),
    ).toBe("selected");
    expect(
      screen
        .getByTestId("match-right-candidate")
        .getAttribute("data-match-state"),
    ).toBe("exiting");

    await waitFor(() => expect(screen.getByText("第 2 / 2 轮")).toBeTruthy());
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: `选择 ${candidates[0].sourceFacts.name}`,
      }),
    );
  });

  it("keeps the champion on its physical side until the challenger wins", async () => {
    renderMatch(4);
    fireEvent.click(
      await screen.findByRole("button", { name: "从 4 家想吃候选开始 Match" }),
    );

    expect(screen.getByText("第 1 / 3 轮")).toBeTruthy();
    let left = screen.getByTestId("match-left-candidate");
    let right = screen.getByTestId("match-right-candidate");
    expect(within(left).getByText(candidates[0].sourceFacts.name)).toBeTruthy();
    expect(
      within(right).getByText(candidates[1].sourceFacts.name),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: `选择 ${candidates[0].sourceFacts.name}`,
      }),
    );
    await waitFor(() => expect(screen.getByText("第 2 / 3 轮")).toBeTruthy());
    left = screen.getByTestId("match-left-candidate");
    right = screen.getByTestId("match-right-candidate");
    expect(within(left).getByText(candidates[0].sourceFacts.name)).toBeTruthy();
    expect(
      within(right).getByText(candidates[2].sourceFacts.name),
    ).toBeTruthy();
    expect(within(left).getByText("上轮胜出")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: `选择 ${candidates[2].sourceFacts.name}`,
      }),
    );
    await waitFor(() => expect(screen.getByText("第 3 / 3 轮")).toBeTruthy());
    left = screen.getByTestId("match-left-candidate");
    right = screen.getByTestId("match-right-candidate");
    expect(within(left).getByText(candidates[3].sourceFacts.name)).toBeTruthy();
    expect(
      within(right).getByText(candidates[2].sourceFacts.name),
    ).toBeTruthy();
    expect(within(right).getByText("上轮胜出")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /撤回|撤销/u })).toBeNull();
    expect(screen.queryByRole("button", { name: "重新开始" })).toBeNull();
  });

  it("opens read-only details without selecting or reordering either restaurant", async () => {
    renderMatch(3);
    fireEvent.click(
      await screen.findByRole("button", { name: "从 3 家想吃候选开始 Match" }),
    );
    const before = screen.getByTestId("match-comparison").textContent;

    fireEvent.click(
      screen.getByRole("button", {
        name: `查看 ${candidates[0].sourceFacts.name} 详情`,
      }),
    );
    const details = screen.getByRole("dialog", {
      name: candidates[0].sourceFacts.name,
    });
    expect(within(details).getByText("只读详情")).toBeTruthy();
    expect(within(details).queryByText(/打卡这家|想吃/u)).toBeNull();
    fireEvent.click(
      within(details).getByRole("button", { name: "返回 Match" }),
    );

    expect(screen.getByTestId("match-comparison").textContent).toBe(before);
    expect(screen.getByText("第 1 / 2 轮")).toBeTruthy();
  });

  it("shares gallery state with read-only details and returns focus to its trigger", async () => {
    renderMatch(3);
    fireEvent.click(
      await screen.findByRole("button", { name: "从 3 家想吃候选开始 Match" }),
    );
    const card = screen.getByTestId("match-left-candidate");
    const detailsTrigger = within(card).getByRole("button", {
      name: `查看 ${candidates[0].sourceFacts.name} 详情`,
    });

    fireEvent.click(
      within(card).getByRole("button", {
        name: `下一张${candidates[0].sourceFacts.name}餐厅插画`,
      }),
    );
    expect(
      within(card).getByAltText(
        `${candidates[0].sourceFacts.name}的餐厅插画，第 2 张`,
      ),
    ).toBeTruthy();

    fireEvent.click(detailsTrigger);
    const details = screen.getByRole("dialog", {
      name: candidates[0].sourceFacts.name,
    });
    expect(
      within(details).getByAltText(
        `${candidates[0].sourceFacts.name}的餐厅插画，第 2 张`,
      ),
    ).toBeTruthy();
    fireEvent.click(
      within(details).getByRole("button", { name: "返回 Match" }),
    );

    await waitFor(() => expect(document.activeElement).toBe(detailsTrigger));
    expect(
      within(card).getByAltText(
        `${candidates[0].sourceFacts.name}的餐厅插画，第 2 张`,
      ),
    ).toBeTruthy();
  });

  it("keeps missing facts aligned and visible in detailed comparison", async () => {
    const complete = FOODLE_RESTAURANTS.find(
      (restaurant) => restaurant.id === "tap-mock-meal",
    )!;
    const missing = FOODLE_RESTAURANTS.find(
      (restaurant) => restaurant.id === "foodle-tap-004",
    )!;
    render(
      <FoodleMatch
        candidates={[complete, missing]}
        sourceLabel="大埔墟站 · 20 分钟范围"
        ready
        random={stableRandom}
        initialSide="left"
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "从 2 家想吃候选开始 Match" }),
    );
    fireEvent.click(screen.getByText("详细比较"));

    const table = screen.getByRole("table", { name: "餐厅资料比较" });
    expect(within(table).getAllByText("暂缺").length).toBeGreaterThanOrEqual(3);
    expect(within(table).getAllByRole("row")).toHaveLength(6);
  });

  it("reopens a persisted result from a separate compact entry", async () => {
    const result = {
      restaurantId: candidates[0].id,
      candidateIds: [candidates[0].id, candidates[1].id],
      sourceLabel: "20 分钟范围",
      mode: "multi" as const,
      finalOpponentId: candidates[1].id,
      completedAt: "2026-08-04T00:00:00.000Z",
    };
    window.localStorage.setItem(
      FOODLE_MATCH_STORAGE_KEY,
      serializeFoodleMatchStore(
        saveFoodleMatchResult(emptyFoodleMatchStore(), result),
      ),
    );
    renderMatch(2);

    const lastMatch = await screen.findByRole("button", {
      name: `查看上次 Match：${candidates[0].sourceFacts.name}`,
    });
    expect(
      screen.getByRole("button", { name: "从 2 家想吃候选开始 Match" }),
    ).toBeTruthy();
    fireEvent.click(lastMatch);

    const dialog = screen.getByRole("dialog", { name: "Foodle Match" });
    expect(within(dialog).getByText("上次 Match")).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: "再选一次" }),
    ).toBeNull();
    const google = within(dialog).getByRole("link", { name: /Google Maps/u });
    const openRice = within(dialog).getByRole("link", { name: /OpenRice/u });
    expect(google.getAttribute("target")).toBe("_blank");
    expect(openRice.getAttribute("target")).toBe("_blank");
    expect(google.getAttribute("rel")).toContain("noopener");
    expect(openRice.getAttribute("rel")).toContain("noreferrer");
    expect(within(dialog).queryByText(/返回地图|完成|今晚吃/u)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Match" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(lastMatch);
  });

  it("reselects the same multi-candidate set without changing saved input", async () => {
    renderMatch(3);
    fireEvent.click(
      await screen.findByRole("button", { name: "从 3 家想吃候选开始 Match" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `选择 ${candidates[0].sourceFacts.name}`,
      }),
    );
    await waitFor(() => expect(screen.getByText("第 2 / 2 轮")).toBeTruthy());
    fireEvent.click(
      screen.getByRole("button", {
        name: `选择 ${candidates[0].sourceFacts.name}`,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("match-result")).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: "再选一次" }));
    const dialog = screen.getByRole("dialog", { name: "Foodle Match" });
    expect(within(dialog).getByTestId("match-comparison")).toBeTruthy();
    expect(within(dialog).getByText("第 1 / 2 轮")).toBeTruthy();
    expect(within(dialog).queryByText("上次 Match")).toBeNull();
  });
});
