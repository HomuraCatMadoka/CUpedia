import { describe, it, expect } from "vitest";
import { currentMonthHkt, startOfHktCalendarWindow } from "@/lib/hkt-datetime";

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

describe("startOfHktCalendarWindow", () => {
  it("starts an inclusive seven-day window at HKT midnight", () => {
    const now = new Date("2026-08-18T15:59:59Z");

    expect(startOfHktCalendarWindow(now, 7).toISOString()).toBe(
      "2026-08-11T16:00:00.000Z",
    );
  });

  it("uses the next HKT date after 16:00 UTC", () => {
    const now = new Date("2026-08-18T16:00:00Z");

    expect(startOfHktCalendarWindow(now, 7).toISOString()).toBe(
      "2026-08-12T16:00:00.000Z",
    );
  });
});
