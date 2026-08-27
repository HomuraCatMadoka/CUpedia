import { describe, expect, expectTypeOf, it } from "vitest";
import type { HktWeekday } from "@/db/schema";
import {
  menuObservationCanProjectActivity,
  menuObservationContextAt,
  menuSyncInitialDrainDeadlineAt,
  menuSyncWindowAt,
} from "@/lib/canteen-menu-sync-window";

describe("canteen menu sync windows", () => {
  it.each([
    ["2026-08-19T16:00:00.000Z", "breakfast", "2026-08-20/breakfast"],
    ["2026-08-19T22:00:00.000Z", "breakfast", "2026-08-20/breakfast"],
    ["2026-08-20T02:59:59.999Z", "breakfast", "2026-08-20/breakfast"],
    ["2026-08-20T03:00:00.000Z", "lunch", "2026-08-20/lunch"],
    ["2026-08-20T08:59:59.999Z", "lunch", "2026-08-20/lunch"],
    ["2026-08-20T09:00:00.000Z", "dinner", "2026-08-20/dinner"],
    ["2026-08-20T15:59:59.999Z", "dinner", "2026-08-20/dinner"],
  ] as const)("maps %s to the fixed %s window", (timestamp, period, key) => {
    const window = menuSyncWindowAt(new Date(timestamp));

    expectTypeOf(window.hktWeekday).toEqualTypeOf<HktWeekday>();
    expect(window).toMatchObject({ period, key, hktWeekday: 4 });
    expect(window?.startsAt.getTime()).toBeLessThanOrEqual(
      new Date(timestamp).getTime(),
    );
    expect(window?.endsAt.getTime()).toBeGreaterThan(
      new Date(timestamp).getTime(),
    );
  });

  it("opens breakfast activity authority at 08:00 HKT", () => {
    expect(
      menuObservationCanProjectActivity(
        menuObservationContextAt(new Date("2026-08-24T19:05:00.000Z")),
      ),
    ).toBe(false);
    expect(
      menuObservationCanProjectActivity(
        menuObservationContextAt(new Date("2026-08-25T00:00:00.000Z")),
      ),
    ).toBe(true);
  });

  it.each([
    ["2026-08-25T00:20:00.000Z", "2026-08-25T00:50:00.000Z"],
    ["2026-08-25T03:20:00.000Z", "2026-08-25T03:50:00.000Z"],
    ["2026-08-25T09:20:00.000Z", "2026-08-25T09:50:00.000Z"],
  ])("allows the scheduled drain to finish after %s", (now, deadline) => {
    expect(menuSyncInitialDrainDeadlineAt(new Date(now)).toISOString()).toBe(
      deadline,
    );
  });
});
