import { describe, expect, it } from "vitest";

import * as matchModule from "@/lib/food-map/match";
import {
  buildMatchComparison,
  chooseFoodleMatch,
  emptyFoodleMatchStore,
  FOODLE_MATCH_STORAGE_KEY,
  getFoodleMatchPair,
  googleMapsUrlFor,
  openRiceUrlFor,
  parseFoodleMatchStore,
  saveFoodleMatchResult,
  serializeFoodleMatchStore,
  startFoodleMatch,
} from "@/lib/food-map/match";
import { FOODLE_RESTAURANTS } from "@/lib/food-map/restaurant-catalog";

describe("Foodle Match", () => {
  it("models zero and one candidate without inventing a comparison", () => {
    expect(startFoodleMatch([], "20 分钟范围")).toEqual({ kind: "empty" });

    expect(
      startFoodleMatch(
        ["only", "only"],
        "沙田站 · 20 分钟范围",
        "2026-08-04T00:00:00.000Z",
      ),
    ).toEqual({
      kind: "result",
      result: {
        restaurantId: "only",
        candidateIds: ["only"],
        sourceLabel: "沙田站 · 20 分钟范围",
        mode: "single",
        finalOpponentId: null,
        completedAt: "2026-08-04T00:00:00.000Z",
      },
    });
  });

  it("keeps the champion on the same side until the challenger is selected", () => {
    const started = startFoodleMatch(
      ["a", "b", "c", "d"],
      "20 分钟范围",
      undefined,
      { random: () => 0.999, championSide: "left" },
    );
    expect(started.kind).toBe("comparison");
    if (started.kind !== "comparison") return;

    expect(getFoodleMatchPair(started.session)).toEqual(["a", "b"]);

    const keptChampion = chooseFoodleMatch(started.session, "a");
    expect(keptChampion.kind).toBe("comparison");
    if (keptChampion.kind !== "comparison") return;
    expect(keptChampion.session.championSide).toBe("left");
    expect(getFoodleMatchPair(keptChampion.session)).toEqual(["a", "c"]);

    const choseChallenger = chooseFoodleMatch(keptChampion.session, "c");
    expect(choseChallenger.kind).toBe("comparison");
    if (choseChallenger.kind !== "comparison") return;
    expect(choseChallenger.session.championSide).toBe("right");
    expect(getFoodleMatchPair(choseChallenger.session)).toEqual(["d", "c"]);

    const completed = chooseFoodleMatch(
      choseChallenger.session,
      "d",
      "2026-08-04T00:00:00.000Z",
    );
    expect(completed).toEqual({
      kind: "result",
      result: {
        restaurantId: "d",
        candidateIds: ["a", "b", "c", "d"],
        sourceLabel: "20 分钟范围",
        mode: "multi",
        finalOpponentId: "c",
        completedAt: "2026-08-04T00:00:00.000Z",
      },
    });
  });

  it("ignores choices outside the visible pair and exposes no undo API", () => {
    const started = startFoodleMatch(
      ["a", "b", "c"],
      "20 分钟范围",
      undefined,
      { random: () => 0.999, championSide: "left" },
    );
    expect(started.kind).toBe("comparison");
    if (started.kind !== "comparison") return;

    expect(chooseFoodleMatch(started.session, "not-visible")).toEqual({
      kind: "comparison",
      session: started.session,
    });
    expect("undoFoodleMatch" in matchModule).toBe(false);
  });

  it("freezes one shuffled order and one initial side per fresh session", () => {
    const started = startFoodleMatch(
      ["a", "b", "c"],
      "20 分钟范围",
      undefined,
      { random: () => 0, championSide: "right" },
    );
    expect(started.kind).toBe("comparison");
    if (started.kind !== "comparison") return;

    expect(started.session.candidateIds).toEqual(["b", "c", "a"]);
    expect(started.session.championSide).toBe("right");
    expect(getFoodleMatchPair(started.session)).toEqual(["c", "b"]);
  });

  it("builds aligned, missing-safe OpenRice-shaped comparison rows", () => {
    const complete = FOODLE_RESTAURANTS.find(
      (restaurant) => restaurant.id === "tap-mock-meal",
    )!;
    const missing = FOODLE_RESTAURANTS.find(
      (restaurant) => restaurant.id === "foodle-tap-004",
    )!;
    const comparison = buildMatchComparison(complete, missing, 7, 7);

    expect(comparison.rows.map((row) => row.key)).toEqual([
      "commute",
      "price",
      "opening",
      "score",
      "community",
    ]);
    expect(comparison.rows[0].right.primary).toBe("暂缺");
    expect(comparison.rows[1].right.primary).toBe("暂缺");
    expect(comparison.rows[2].right.primary).toBe("资料暂缺");
    expect(comparison.rows[3].right.primary).toBe("暂缺");
    expect(comparison.rows[4].right.secondary).toContain("5 次打卡");
    expect(comparison.differences.length).toBeLessThanOrEqual(2);
    expect(
      comparison.differences.every((difference) =>
        difference.text.includes(complete.sourceFacts.name),
      ),
    ).toBe(true);
  });

  it("round-trips only valid completed results", () => {
    const result = {
      restaurantId: "a",
      candidateIds: ["a", "b"],
      sourceLabel: "20 分钟范围",
      mode: "multi" as const,
      finalOpponentId: "b",
      completedAt: "2026-08-04T00:00:00.000Z",
    };
    const store = saveFoodleMatchResult(emptyFoodleMatchStore(), result);

    expect(FOODLE_MATCH_STORAGE_KEY).toBe("cupedia:foodle-match:v1");
    expect(parseFoodleMatchStore(serializeFoodleMatchStore(store))).toEqual(
      store,
    );
    expect(
      parseFoodleMatchStore(
        JSON.stringify({
          version: 1,
          result: { ...result, restaurantId: "outside" },
        }),
      ),
    ).toEqual(emptyFoodleMatchStore());
    expect(parseFoodleMatchStore("not-json")).toEqual(emptyFoodleMatchStore());
  });

  it("builds non-mutating external destination URLs", () => {
    const withSource = FOODLE_RESTAURANTS[0];
    const missingSource = FOODLE_RESTAURANTS.find(
      (restaurant) => restaurant.source.url === null,
    )!;

    expect(googleMapsUrlFor(withSource, "沙田")).toMatch(
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/u,
    );
    expect(decodeURIComponent(googleMapsUrlFor(withSource, "沙田"))).toContain(
      withSource.sourceFacts.name,
    );
    expect(openRiceUrlFor(withSource)).toBe(withSource.source.url);
    expect(openRiceUrlFor(missingSource)).toMatch(
      /^https:\/\/www\.openrice\.com\/zh\/hongkong\/restaurants\?what=/u,
    );
  });
});
