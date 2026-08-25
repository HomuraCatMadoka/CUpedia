import { describe, expect, it } from "vitest";
import { projectScopedMenuObservation } from "@/lib/canteen-menu-projection";
import { menuObservationContextAt } from "@/lib/canteen-menu-sync-window";
import type { ProviderMenuObservation } from "@/lib/canteen-types";

const SOURCE = {
  syncMealPeriods: ["breakfast", "lunch", "dinner"] as const,
};

function breakfastObservation(): ProviderMenuObservation {
  return {
    snapshotCompleteness: "partial",
    observationScope: { kind: "meal-period", mealPeriod: "breakfast" },
    items: [
      {
        externalProductId: "breakfast-item",
        name: "早餐菜品",
        priceOptions: [],
        mealPeriods: ["allday"],
        sortOrder: 0,
        svgKey: "早餐",
      },
    ],
  };
}

describe("current menu projection", () => {
  it("keeps a 03:05 breakfast-labelled read diagnostic-only (#743)", () => {
    const context = menuObservationContextAt(
      new Date("2026-08-24T19:05:00.000Z"),
    );

    expect(
      projectScopedMenuObservation(SOURCE, context, breakfastObservation()),
    ).toEqual({ items: [], absenceAuthority: { kind: "none" } });
  });

  it("projects an 08:17 observation only into the observed meal period", () => {
    const context = menuObservationContextAt(
      new Date("2026-08-25T00:17:00.000Z"),
    );

    expect(
      projectScopedMenuObservation(SOURCE, context, breakfastObservation()),
    ).toEqual({
      items: [
        expect.objectContaining({
          externalProductId: "breakfast-item",
          mealPeriods: ["breakfast"],
        }),
      ],
      absenceAuthority: {
        kind: "current-activity",
        coveredMealPeriods: ["breakfast"],
        configuredMealPeriods: ["breakfast", "lunch", "dinner"],
      },
    });
  });
});
