import { describe, expect, it } from "vitest";
import { nextMenuSourceObservationAt } from "@/lib/canteen-menu-sync-scheduler";
import { menuSyncWindowAt } from "@/lib/canteen-menu-sync-window";

describe("canteen menu observation refresh scheduling", () => {
  it("reopens the same lunch period at a provider publication boundary", () => {
    const observedAt = new Date("2026-08-25T06:17:00.000Z"); // 14:17 HKT
    const window = menuSyncWindowAt(observedAt);

    expect(
      nextMenuSourceObservationAt(
        window,
        {
          observedAt,
          observedMinuteOfDay: 14 * 60 + 17,
          observationScope: "meal-period",
          scopeEvidence: { refreshBoundaryMinutes: [14 * 60 + 30] },
        },
        new Date("2026-08-25T06:17:00.000Z"),
      ),
    ).toEqual(new Date("2026-08-25T06:30:00.000Z"));
  });

  it("does not repeat immediately for a boundary just after observation", () => {
    const observedAt = new Date("2026-08-25T06:29:00.000Z"); // 14:29 HKT

    expect(
      nextMenuSourceObservationAt(
        menuSyncWindowAt(observedAt),
        {
          observedAt,
          observedMinuteOfDay: 14 * 60 + 29,
          observationScope: "meal-period",
          scopeEvidence: { refreshBoundaryMinutes: [14 * 60 + 30] },
        },
        new Date("2026-08-25T06:29:00.000Z"),
      ),
    ).toEqual(new Date("2026-08-25T06:39:00.000Z"));
  });

  it("bounds staleness when the provider exposes no next boundary", () => {
    const observedAt = new Date("2026-08-25T03:17:00.000Z"); // 11:17 HKT

    expect(
      nextMenuSourceObservationAt(
        menuSyncWindowAt(observedAt),
        {
          observedAt,
          observedMinuteOfDay: 11 * 60 + 17,
          observationScope: "meal-period",
          scopeEvidence: {},
        },
        new Date("2026-08-25T03:17:00.000Z"),
      ),
    ).toEqual(new Date("2026-08-25T04:02:00.000Z"));
  });

  it("does not repeat a catalog observation inside the same meal period", () => {
    const observedAt = new Date("2026-08-25T03:17:00.000Z");

    expect(
      nextMenuSourceObservationAt(
        menuSyncWindowAt(observedAt),
        {
          observedAt,
          observedMinuteOfDay: 11 * 60 + 17,
          observationScope: "catalog",
          scopeEvidence: { refreshBoundaryMinutes: [14 * 60 + 30] },
        },
        new Date("2026-08-25T03:17:00.000Z"),
      ),
    ).toBeNull();
  });

  it("ignores malformed and oversized provider refresh hints", () => {
    const observedAt = new Date("2026-08-25T06:17:00.000Z"); // 14:17 HKT
    const invalidHints = Array.from({ length: 128 }, () => "14:30");

    expect(
      nextMenuSourceObservationAt(
        menuSyncWindowAt(observedAt),
        {
          observedAt,
          observedMinuteOfDay: 14 * 60 + 17,
          observationScope: "meal-period",
          scopeEvidence: {
            refreshBoundaryMinutes: [...invalidHints, 14 * 60 + 30],
          },
        },
        new Date("2026-08-25T06:17:00.000Z"),
      ),
    ).toEqual(new Date("2026-08-25T07:02:00.000Z"));
  });

  it("stops recurring observations after the provider refresh horizon", () => {
    const observedAt = new Date("2026-08-26T11:44:01.000Z"); // 19:44 HKT

    expect(
      nextMenuSourceObservationAt(
        menuSyncWindowAt(observedAt),
        {
          observedAt,
          observedMinuteOfDay: 19 * 60 + 44,
          observationScope: "meal-period",
          scopeEvidence: {
            refreshBoundaryMinutes: [19 * 60 + 45, 20 * 60, 20 * 60 + 30],
            refreshUntilMinute: 20 * 60,
          },
        },
        new Date("2026-08-26T12:04:21.000Z"), // 20:04 HKT
      ),
    ).toBeNull();
  });

  it("treats a valid same-day horizon as terminal when the observation is already later", () => {
    const observedAt = new Date("2026-08-26T12:04:21.000Z"); // 20:04 HKT

    expect(
      nextMenuSourceObservationAt(
        menuSyncWindowAt(observedAt),
        {
          observedAt,
          observedMinuteOfDay: 20 * 60 + 4,
          observationScope: "meal-period",
          scopeEvidence: { refreshUntilMinute: 20 * 60 },
        },
        observedAt,
      ),
    ).toBeNull();
  });

  it("keeps existing refresh rules before the provider refresh horizon", () => {
    const observedAt = new Date("2026-08-26T11:44:01.000Z"); // 19:44 HKT

    expect(
      nextMenuSourceObservationAt(
        menuSyncWindowAt(observedAt),
        {
          observedAt,
          observedMinuteOfDay: 19 * 60 + 44,
          observationScope: "meal-period",
          scopeEvidence: {
            refreshBoundaryMinutes: [19 * 60 + 45, 20 * 60],
            refreshUntilMinute: 20 * 60,
          },
        },
        new Date("2026-08-26T11:53:00.000Z"), // 19:53 HKT
      ),
    ).toEqual(new Date("2026-08-26T11:54:01.000Z"));
  });

  it.each([undefined, "20:00", -1, 24 * 60, [20 * 60]])(
    "preserves the fallback for an unusable refresh horizon: %j",
    (refreshUntilMinute) => {
      const observedAt = new Date("2026-08-26T11:44:00.000Z");

      expect(
        nextMenuSourceObservationAt(
          menuSyncWindowAt(observedAt),
          {
            observedAt,
            observedMinuteOfDay: 19 * 60 + 44,
            observationScope: "meal-period",
            scopeEvidence: { refreshUntilMinute },
          },
          new Date("2026-08-26T12:30:00.000Z"),
        ),
      ).toEqual(new Date("2026-08-26T12:29:00.000Z"));
    },
  );
});
