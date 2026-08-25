import { describe, expect, it } from "vitest";
import { nextMenuSourceObservationAt } from "@/lib/canteen-menu-sync-scheduler";
import { menuSyncWindowAt } from "@/lib/canteen-menu-sync-window";

describe("canteen menu observation refresh scheduling", () => {
  it("reopens the same lunch period at a provider publication boundary", () => {
    const observedAt = new Date("2026-08-25T06:17:00.000Z"); // 14:17 HKT
    const window = menuSyncWindowAt(observedAt);

    expect(
      nextMenuSourceObservationAt(window, {
        observedAt,
        observedMinuteOfDay: 14 * 60 + 17,
        observationScope: "meal-period",
        scopeEvidence: { refreshBoundaryMinutes: [14 * 60 + 30] },
      }),
    ).toEqual(new Date("2026-08-25T06:30:00.000Z"));
  });

  it("does not repeat immediately for a boundary just after observation", () => {
    const observedAt = new Date("2026-08-25T06:29:00.000Z"); // 14:29 HKT

    expect(
      nextMenuSourceObservationAt(menuSyncWindowAt(observedAt), {
        observedAt,
        observedMinuteOfDay: 14 * 60 + 29,
        observationScope: "meal-period",
        scopeEvidence: { refreshBoundaryMinutes: [14 * 60 + 30] },
      }),
    ).toEqual(new Date("2026-08-25T06:39:00.000Z"));
  });

  it("bounds staleness when the provider exposes no next boundary", () => {
    const observedAt = new Date("2026-08-25T03:17:00.000Z"); // 11:17 HKT

    expect(
      nextMenuSourceObservationAt(menuSyncWindowAt(observedAt), {
        observedAt,
        observedMinuteOfDay: 11 * 60 + 17,
        observationScope: "meal-period",
        scopeEvidence: {},
      }),
    ).toEqual(new Date("2026-08-25T04:02:00.000Z"));
  });

  it("does not repeat a catalog observation inside the same meal period", () => {
    const observedAt = new Date("2026-08-25T03:17:00.000Z");

    expect(
      nextMenuSourceObservationAt(menuSyncWindowAt(observedAt), {
        observedAt,
        observedMinuteOfDay: 11 * 60 + 17,
        observationScope: "catalog",
        scopeEvidence: { refreshBoundaryMinutes: [14 * 60 + 30] },
      }),
    ).toBeNull();
  });

  it("ignores malformed and oversized provider refresh hints", () => {
    const observedAt = new Date("2026-08-25T06:17:00.000Z"); // 14:17 HKT
    const invalidHints = Array.from({ length: 128 }, () => "14:30");

    expect(
      nextMenuSourceObservationAt(menuSyncWindowAt(observedAt), {
        observedAt,
        observedMinuteOfDay: 14 * 60 + 17,
        observationScope: "meal-period",
        scopeEvidence: {
          refreshBoundaryMinutes: [...invalidHints, 14 * 60 + 30],
        },
      }),
    ).toEqual(new Date("2026-08-25T07:02:00.000Z"));
  });
});
