import { describe, it, expect } from "vitest";
import { currentMonthHkt } from "@/lib/hkt-datetime";

describe("currentMonthHkt", () => {
  it("returns YYYY-MM in Asia/Hong_Kong", () => {
    const jan = currentMonthHkt(new Date("2026-01-15T12:00:00Z"));
    expect(jan).toMatch(/^\d{4}-\d{2}$/);
  });

  it("uses HKT date boundary near UTC midnight", () => {
    // 2026-06-30 20:00 UTC = 2026-07-01 04:00 HKT → July
    expect(currentMonthHkt(new Date("2026-06-30T20:00:00Z"))).toBe("2026-07");
  });
});
