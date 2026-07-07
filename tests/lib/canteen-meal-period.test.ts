import { describe, it, expect } from "vitest";
import {
  defaultMealPeriodForHkt,
  shouldShowAfternoonHint,
} from "@/lib/canteen-meal-period";
import { hktDate } from "../helpers/hkt-date";

describe("defaultMealPeriodForHkt", () => {
  it("selects breakfast before 11:30 HKT (10:00 mock)", () => {
    expect(defaultMealPeriodForHkt(hktDate(10, 0))).toBe("breakfast");
  });

  it("selects lunch from 11:30 HKT (12:00 mock)", () => {
    expect(defaultMealPeriodForHkt(hktDate(12, 0))).toBe("lunch");
  });

  it("selects lunch in afternoon window (15:00 mock)", () => {
    expect(defaultMealPeriodForHkt(hktDate(15, 0))).toBe("lunch");
  });

  it("selects dinner from 17:30 HKT (18:00 mock)", () => {
    expect(defaultMealPeriodForHkt(hktDate(18, 0))).toBe("dinner");
  });

  it("switches at boundaries 11:30 and 17:30", () => {
    expect(defaultMealPeriodForHkt(hktDate(11, 29))).toBe("breakfast");
    expect(defaultMealPeriodForHkt(hktDate(11, 30))).toBe("lunch");
    expect(defaultMealPeriodForHkt(hktDate(17, 29))).toBe("lunch");
    expect(defaultMealPeriodForHkt(hktDate(17, 30))).toBe("dinner");
  });
});

describe("shouldShowAfternoonHint", () => {
  it("shows hint between 14:30 and 17:29 HKT inclusive", () => {
    expect(shouldShowAfternoonHint(hktDate(14, 29))).toBe(false);
    expect(shouldShowAfternoonHint(hktDate(14, 30))).toBe(true);
    expect(shouldShowAfternoonHint(hktDate(15, 0))).toBe(true);
    expect(shouldShowAfternoonHint(hktDate(17, 29))).toBe(true);
    expect(shouldShowAfternoonHint(hktDate(17, 30))).toBe(false);
  });

  it("does not show hint at breakfast or early lunch", () => {
    expect(shouldShowAfternoonHint(hktDate(10, 0))).toBe(false);
    expect(shouldShowAfternoonHint(hktDate(12, 0))).toBe(false);
  });
});
