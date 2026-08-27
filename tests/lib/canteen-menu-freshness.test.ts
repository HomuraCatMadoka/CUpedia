import { describe, expect, it } from "vitest";
import { staleMenuFreshnessLabel } from "@/lib/canteen-menu-freshness";

describe("canteen menu freshness", () => {
  const evaluatedAt = new Date("2026-08-27T04:00:00.000Z");

  it("labels the previous HKT calendar day as yesterday", () => {
    expect(
      staleMenuFreshnessLabel(
        new Date("2026-08-26T04:00:00.000Z"),
        evaluatedAt,
      ),
    ).toBe("最后同步于昨天 12:00");
  });

  it("labels older successful observations with their HKT date", () => {
    expect(
      staleMenuFreshnessLabel(
        new Date("2026-08-24T03:30:00.000Z"),
        evaluatedAt,
      ),
    ).toBe("最后同步于24/8 11:30");
  });

  it("does not warn for the current HKT calendar day or no success", () => {
    expect(
      staleMenuFreshnessLabel(
        new Date("2026-08-27T00:00:00.000Z"),
        evaluatedAt,
      ),
    ).toBeNull();
    expect(staleMenuFreshnessLabel(null, evaluatedAt)).toBeNull();
  });
});
