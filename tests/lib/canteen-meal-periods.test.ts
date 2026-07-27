import { describe, it, expect } from "vitest";
import {
  normalizeMealPeriods,
  mealPeriodsFromRow,
  itemMatchesMealPeriod,
  availableMealPeriods,
} from "@/lib/canteen-meal-periods";

describe("normalizeMealPeriods", () => {
  it("defaults missing/empty to allday", () => {
    expect(normalizeMealPeriods(undefined)).toEqual(["allday"]);
    expect(normalizeMealPeriods(null)).toEqual(["allday"]);
    expect(normalizeMealPeriods("")).toEqual(["allday"]);
    expect(normalizeMealPeriods([])).toEqual(["allday"]);
  });

  it("accepts a legacy scalar string", () => {
    expect(normalizeMealPeriods("lunch")).toEqual(["lunch"]);
  });

  it("collapses allday mixed with specifics to allday only", () => {
    expect(normalizeMealPeriods(["allday", "lunch"])).toEqual(["allday"]);
  });

  it("orders multi-period breakfast → lunch → dinner", () => {
    expect(normalizeMealPeriods(["dinner", "breakfast", "lunch"])).toEqual([
      "breakfast",
      "lunch",
      "dinner",
    ]);
  });

  it("rejects unknown values", () => {
    expect(normalizeMealPeriods("brunch")).toBeNull();
    expect(normalizeMealPeriods(["lunch", "brunch"])).toBeNull();
  });
});

describe("mealPeriodsFromRow", () => {
  it("prefers mealPeriods over mealPeriod", () => {
    expect(
      mealPeriodsFromRow({ mealPeriods: ["dinner"], mealPeriod: "lunch" }),
    ).toEqual(["dinner"]);
  });

  it("falls back to scalar mealPeriod", () => {
    expect(mealPeriodsFromRow({ mealPeriod: "breakfast" })).toEqual([
      "breakfast",
    ]);
  });

  it("defaults when neither field is present", () => {
    expect(mealPeriodsFromRow({})).toEqual(["allday"]);
  });
});

describe("itemMatchesMealPeriod", () => {
  it("matches specific and allday", () => {
    expect(itemMatchesMealPeriod(["lunch"], "lunch")).toBe(true);
    expect(itemMatchesMealPeriod(["lunch"], "dinner")).toBe(false);
    expect(itemMatchesMealPeriod(["allday"], "breakfast")).toBe(true);
    expect(itemMatchesMealPeriod(["lunch", "dinner"], "dinner")).toBe(true);
  });
});

describe("availableMealPeriods with allday", () => {
  it("hides tabs for allday-only menus", () => {
    expect(
      availableMealPeriods([
        { mealPeriods: ["allday"] },
        { mealPeriods: ["allday"] },
      ]),
    ).toEqual([]);
  });
});
