import { describe, expect, it } from "vitest";
import {
  CANTEEN_STATUS_CLOSED,
  CANTEEN_STATUS_OPEN,
  CANTEEN_STATUS_UNKNOWN,
  canteenOpeningWeek,
  canteenOpenStatus,
  canteenOpenStatusForClock,
  clockFreeCanteenOpenStatus,
  formatCanteenOpeningWindow,
  hktWeekday,
  parseCanteenOpeningHours,
  type CanteenOpeningHours,
} from "@/lib/canteen-opening-hours";

/**
 * Build an instant from an HKT wall-clock string, so cases read as local time
 * instead of hand-computed UTC (HK is UTC+8 with no DST).
 */
function hkt(local: string): Date {
  return new Date(`${local}:00+08:00`);
}

function hktWeekdayName(local: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    weekday: "short",
  }).format(hkt(local));
}

const WEEKDAY_0800_2000: CanteenOpeningHours = {
  kind: "weekly",
  timezone: "Asia/Hong_Kong",
  intervals: [
    { days: [1, 2, 3, 4, 5], opensAt: "08:00", closesAt: "20:00" },
  ],
};

describe("canteenOpenStatus", () => {
  it("reports unknown when no schedule was recorded", () => {
    expect(canteenOpenStatus(undefined, hkt("2026-03-02T12:00"))).toEqual(
      CANTEEN_STATUS_UNKNOWN,
    );
    expect(canteenOpenStatus(null, hkt("2026-03-02T12:00"))).toEqual(
      CANTEEN_STATUS_UNKNOWN,
    );
    expect(
      canteenOpenStatus({ kind: "unknown" }, hkt("2026-03-02T12:00")),
    ).toEqual(CANTEEN_STATUS_UNKNOWN);
  });

  it("reports open for an always-open schedule regardless of the clock", () => {
    expect(
      canteenOpenStatus({ kind: "always" }, hkt("2026-03-02T03:00")),
    ).toEqual(CANTEEN_STATUS_OPEN);
    expect(
      canteenOpenStatus({ kind: "always" }, hkt("2026-03-02T23:59")),
    ).toEqual(CANTEEN_STATUS_OPEN);
  });

  it("is open inside a window and closed outside it", () => {
    expect(
      canteenOpenStatus(WEEKDAY_0800_2000, hkt("2026-03-02T12:00")),
    ).toEqual(CANTEEN_STATUS_OPEN);
    expect(
      canteenOpenStatus(WEEKDAY_0800_2000, hkt("2026-03-02T07:59")),
    ).toEqual(CANTEEN_STATUS_CLOSED);
    expect(
      canteenOpenStatus(WEEKDAY_0800_2000, hkt("2026-03-02T20:01")),
    ).toEqual(CANTEEN_STATUS_CLOSED);
  });

  it("treats opensAt as inclusive and closesAt as exclusive", () => {
    expect(
      canteenOpenStatus(WEEKDAY_0800_2000, hkt("2026-03-02T08:00")),
    ).toEqual(CANTEEN_STATUS_OPEN);
    expect(
      canteenOpenStatus(WEEKDAY_0800_2000, hkt("2026-03-02T20:00")),
    ).toEqual(CANTEEN_STATUS_CLOSED);
  });

  it("is closed on a weekday the schedule does not cover", () => {
    // 2026-03-07 is a Saturday; the fixture only lists Mon–Fri.
    expect(hktWeekdayName("2026-03-07T12:00")).toBe("Sat");
    expect(
      canteenOpenStatus(WEEKDAY_0800_2000, hkt("2026-03-07T12:00")),
    ).toEqual(CANTEEN_STATUS_CLOSED);
  });

  it("is closed when the schedule records no windows at all", () => {
    const neverOpen: CanteenOpeningHours = {
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [],
    };
    expect(canteenOpenStatus(neverOpen, hkt("2026-03-02T12:00"))).toEqual(
      CANTEEN_STATUS_CLOSED,
    );
  });

  it("reads the weekday in HKT, not in UTC", () => {
    // 2026-03-02T23:30Z is still Monday in UTC but already Tuesday 07:30 in HKT.
    const instant = hkt("2026-03-03T07:30");
    expect(instant.toISOString()).toBe("2026-03-02T23:30:00.000Z");
    expect(instant.getUTCDay()).toBe(1); // Monday in UTC
    expect(hktWeekdayName("2026-03-03T07:30")).toBe("Tue");

    const tuesdayMorning: CanteenOpeningHours = {
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [{ days: [2], opensAt: "07:00", closesAt: "09:00" }],
    };
    expect(canteenOpenStatus(tuesdayMorning, instant)).toEqual(
      CANTEEN_STATUS_OPEN,
    );
  });

  it("keeps a window that crosses midnight open after 00:00", () => {
    const lateNight: CanteenOpeningHours = {
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [
        { days: [5], opensAt: "22:00", closesAt: "01:30" },
      ],
    };
    expect(hktWeekdayName("2026-03-06T23:00")).toBe("Fri");
    expect(hktWeekdayName("2026-03-07T00:30")).toBe("Sat");

    // Opens Friday evening ...
    expect(canteenOpenStatus(lateNight, hkt("2026-03-06T23:00"))).toEqual(
      CANTEEN_STATUS_OPEN,
    );
    // ... and is still running early Saturday.
    expect(canteenOpenStatus(lateNight, hkt("2026-03-07T00:30"))).toEqual(
      CANTEEN_STATUS_OPEN,
    );
    expect(canteenOpenStatus(lateNight, hkt("2026-03-07T01:30"))).toEqual(
      CANTEEN_STATUS_CLOSED,
    );
    expect(canteenOpenStatus(lateNight, hkt("2026-03-07T02:00"))).toEqual(
      CANTEEN_STATUS_CLOSED,
    );
  });

  it("ignores malformed windows instead of reporting open", () => {
    const malformed = {
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [
        { days: [1], opensAt: "25:00", closesAt: "26:00" },
        { days: [1], opensAt: "08:00", closesAt: "08:00" },
        { days: [], opensAt: "08:00", closesAt: "20:00" },
      ],
    } as unknown as CanteenOpeningHours;
    expect(canteenOpenStatus(malformed, hkt("2026-03-02T12:00"))).toEqual(
      CANTEEN_STATUS_CLOSED,
    );
  });
});

describe("clockFreeCanteenOpenStatus", () => {
  it("resolves the states that need no clock", () => {
    expect(clockFreeCanteenOpenStatus(undefined)).toEqual(CANTEEN_STATUS_UNKNOWN);
    expect(clockFreeCanteenOpenStatus({ kind: "unknown" })).toEqual(
      CANTEEN_STATUS_UNKNOWN,
    );
    expect(clockFreeCanteenOpenStatus({ kind: "always" })).toEqual(
      CANTEEN_STATUS_OPEN,
    );
  });

  it("defers weekly schedules to the caller's clock", () => {
    expect(clockFreeCanteenOpenStatus(WEEKDAY_0800_2000)).toBeNull();
  });
});

describe("parseCanteenOpeningHours", () => {
  it("accepts each variant and an empty window list", () => {
    expect(parseCanteenOpeningHours({ kind: "unknown" })).toEqual({
      kind: "unknown",
    });
    expect(parseCanteenOpeningHours({ kind: "always" })).toEqual({
      kind: "always",
    });
    expect(
      parseCanteenOpeningHours({
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
        intervals: [],
      }),
    ).toEqual({ kind: "weekly", timezone: "Asia/Hong_Kong", intervals: [] });
    expect(
      parseCanteenOpeningHours({
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
        intervals: [{ days: [0, 6], opensAt: "09:30", closesAt: "17:00" }],
      }),
    ).toEqual({
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [{ days: [0, 6], opensAt: "09:30", closesAt: "17:00" }],
    });
  });

  it("rejects shapes the domain cannot interpret", () => {
    const invalid: unknown[] = [
      null,
      "weekly",
      [],
      { kind: "sometimes" },
      { kind: "weekly", timezone: "UTC", intervals: [] },
      { kind: "weekly", timezone: "Asia/Hong_Kong", intervals: "none" },
      {
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
        intervals: [{ days: [], opensAt: "08:00", closesAt: "20:00" }],
      },
      {
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
        intervals: [{ days: [7], opensAt: "08:00", closesAt: "20:00" }],
      },
      {
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
        intervals: [{ days: [1, 1], opensAt: "08:00", closesAt: "20:00" }],
      },
      {
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
        intervals: [{ days: [1], opensAt: "8:00", closesAt: "20:00" }],
      },
      {
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
        intervals: [{ days: [1], opensAt: "08:00", closesAt: "24:00" }],
      },
      {
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
        intervals: [{ days: [1], opensAt: "20:00", closesAt: "20:00" }],
      },
    ];
    for (const input of invalid) {
      expect(() => parseCanteenOpeningHours(input)).toThrow();
    }
  });
});

describe("hktWeekday", () => {
  it("resolves the weekday in HKT rather than UTC", () => {
    // 2026-03-02T23:30Z is Monday in UTC and Tuesday 07:30 in HKT.
    expect(hktWeekday(new Date("2026-03-02T23:30:00Z"))).toBe(2);
    expect(hktWeekday(hkt("2026-03-02T12:00"))).toBe(1);
    expect(hktWeekday(hkt("2026-03-07T12:00"))).toBe(6);
  });
});

describe("canteenOpenStatusForClock", () => {
  it("resolves clock-independent schedules without a clock", () => {
    expect(canteenOpenStatusForClock(undefined, null)).toEqual(
      CANTEEN_STATUS_UNKNOWN,
    );
    expect(canteenOpenStatusForClock({ kind: "always" }, null)).toEqual(
      CANTEEN_STATUS_OPEN,
    );
  });

  it("reports unknown for a weekly schedule before a clock exists", () => {
    expect(canteenOpenStatusForClock(WEEKDAY_0800_2000, null)).toEqual(
      CANTEEN_STATUS_UNKNOWN,
    );
  });

  it("defers to canteenOpenStatus once a clock exists", () => {
    expect(
      canteenOpenStatusForClock(WEEKDAY_0800_2000, hkt("2026-03-02T12:00")),
    ).toEqual(CANTEEN_STATUS_OPEN);
    expect(
      canteenOpenStatusForClock(WEEKDAY_0800_2000, hkt("2026-03-02T21:00")),
    ).toEqual(CANTEEN_STATUS_CLOSED);
  });
});

describe("formatCanteenOpeningWindow", () => {
  it("formats a same-day window", () => {
    expect(
      formatCanteenOpeningWindow({
        days: [1],
        opensAt: "08:00",
        closesAt: "20:00",
      }),
    ).toBe("08:00 – 20:00");
  });

  it("marks a window that runs past midnight", () => {
    expect(
      formatCanteenOpeningWindow({
        days: [5],
        opensAt: "22:00",
        closesAt: "01:30",
      }),
    ).toBe("22:00 – 次日 01:30");
  });
});

describe("canteenOpeningWeek", () => {
  it("returns null for schedules with no weekly table", () => {
    expect(canteenOpeningWeek(undefined)).toBeNull();
    expect(canteenOpeningWeek({ kind: "unknown" })).toBeNull();
    expect(canteenOpeningWeek({ kind: "always" })).toBeNull();
  });

  it("lists all seven days Monday first, with unrecorded days closed", () => {
    const week = canteenOpeningWeek(WEEKDAY_0800_2000);
    expect(week?.map((day) => day.label)).toEqual([
      "周一",
      "周二",
      "周三",
      "周四",
      "周五",
      "周六",
      "周日",
    ]);
    expect(week?.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(week?.[0].windows).toEqual(["08:00 – 20:00"]);
    expect(week?.[5].windows).toEqual([]);
    expect(week?.[6].windows).toEqual([]);
  });

  it("orders several windows by opening time and drops duplicates", () => {
    const week = canteenOpeningWeek({
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [
        { days: [1], opensAt: "17:30", closesAt: "21:00" },
        { days: [1], opensAt: "08:00", closesAt: "11:30" },
        { days: [1], opensAt: "08:00", closesAt: "11:30" },
      ],
    });
    expect(week?.[0].windows).toEqual([
      "08:00 – 11:30",
      "17:30 – 21:00",
    ]);
  });

  it("keeps a cross-midnight window on the day it opens", () => {
    const week = canteenOpeningWeek({
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [{ days: [5], opensAt: "22:00", closesAt: "01:30" }],
    });
    expect(week?.[4].label).toBe("周五");
    expect(week?.[4].windows).toEqual(["22:00 – 次日 01:30"]);
    expect(week?.[5].windows).toEqual([]);
  });
});
