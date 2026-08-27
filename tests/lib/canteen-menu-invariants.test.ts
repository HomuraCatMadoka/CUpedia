import { describe, expect, it } from "vitest";
import { buildMenuInvariantReport } from "@/lib/canteen-menu-invariants";

const source = {
  id: "source-1",
  canteenId: "canteen-1",
  canteenName: "测试饭堂",
  provider: "pinme",
  externalStoreId: "123",
  syncMealPeriods: ["lunch", "dinner"] as const,
  closedWeekdays: [],
  lastErrorCode: null,
  hasLiveClaim: false,
};

describe("canteen production invariants", () => {
  it("accepts the canonical union of every configured period", () => {
    const report = buildMenuInvariantReport({
      evaluatedAt: new Date("2026-08-27T10:00:00Z"),
      sources: [{ ...source, syncMealPeriods: [...source.syncMealPeriods] }],
      items: [
        {
          id: "dish-a",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "A",
          normalizedName: "a",
          mealPeriods: ["lunch", "dinner"],
          isAvailable: true,
        },
        {
          id: "dish-b",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "B",
          normalizedName: "b",
          mealPeriods: ["lunch"],
          isAvailable: true,
        },
        {
          id: "retired",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "旧菜",
          normalizedName: "旧菜",
          mealPeriods: [],
          isAvailable: false,
        },
      ],
      offerings: [
        {
          menuSourceId: "source-1",
          menuItemId: "dish-a",
          externalProductId: "l-a",
        },
        {
          menuSourceId: "source-1",
          menuItemId: "dish-a",
          externalProductId: "d-a",
        },
        {
          menuSourceId: "source-1",
          menuItemId: "dish-b",
          externalProductId: "l-b",
        },
      ],
      observations: [
        {
          menuSourceId: "source-1",
          mealPeriod: "lunch",
          runId: "lunch-run",
          observedAt: new Date("2026-08-27T03:20:00Z"),
          externalProductIds: ["l-a", "l-b"],
        },
        {
          menuSourceId: "source-1",
          mealPeriod: "dinner",
          runId: "dinner-run",
          observedAt: new Date("2026-08-27T09:20:00Z"),
          externalProductIds: ["d-a"],
        },
      ],
      transitions: [],
      historyTotals: {
        menuItems: 3,
        comments: 4,
        votes: 5,
        identityTransitions: 1,
      },
    });

    expect(report.ok).toBe(true);
    expect(report.sources[0]).toMatchObject({
      counts: { snapshotUnion: 2, active: 2, inactive: 1 },
      missingActiveItemIds: [],
      unexpectedActiveItemIds: [],
      duplicateCanonicalNames: [],
      configuredOutActiveItems: [],
    });
  });

  it("reports every actionable drift without hiding retained inactive UUIDs", () => {
    const report = buildMenuInvariantReport({
      evaluatedAt: new Date("2026-08-27T10:00:00Z"),
      sources: [
        {
          ...source,
          syncMealPeriods: [...source.syncMealPeriods],
          lastErrorCode: "UPSTREAM_FAILED",
          hasLiveClaim: true,
        },
      ],
      items: [
        {
          id: "dish-a",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "同名",
          normalizedName: "同名",
          mealPeriods: ["breakfast", "lunch"],
          isAvailable: true,
        },
        {
          id: "dish-b",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "同名",
          normalizedName: "同名",
          mealPeriods: ["dinner"],
          isAvailable: true,
        },
        {
          id: "expected-but-inactive",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "C",
          normalizedName: "c",
          mealPeriods: [],
          isAvailable: false,
        },
      ],
      offerings: [
        {
          menuSourceId: "source-1",
          menuItemId: "dish-a",
          externalProductId: "duplicate",
        },
        {
          menuSourceId: "source-1",
          menuItemId: "dish-b",
          externalProductId: "duplicate",
        },
        {
          menuSourceId: "source-1",
          menuItemId: "expected-but-inactive",
          externalProductId: "inactive",
        },
      ],
      observations: [
        {
          menuSourceId: "source-1",
          mealPeriod: "lunch",
          runId: "old",
          observedAt: new Date("2026-08-25T03:20:00Z"),
          externalProductIds: ["duplicate", "inactive", "missing"],
        },
      ],
      transitions: [],
      historyTotals: {
        menuItems: 3,
        comments: 0,
        votes: 0,
        identityTransitions: 0,
      },
    });

    expect(report.ok).toBe(false);
    expect(report.sources[0].problems).toEqual(
      expect.arrayContaining([
        "last-error:UPSTREAM_FAILED",
        "live-claim",
        "stale-period:lunch",
        "missing-period:dinner",
        "duplicate-offering-mapping",
        "unmapped-snapshot-offering",
        "duplicate-canonical-name",
        "configured-out-active-period",
        "projection-drift",
      ]),
    );
    expect(report.sources[0].missingActiveItemIds).toEqual([
      "expected-but-inactive",
    ]);
    expect(report.sources[0].unexpectedActiveItemIds).toEqual([
      "dish-a",
      "dish-b",
    ]);
    expect(report.sources[0].counts.inactive).toBe(1);
  });

  it("compares snapshots with every row the public menu can return", () => {
    const report = buildMenuInvariantReport({
      evaluatedAt: new Date("2026-08-27T10:00:00Z"),
      sources: [{ ...source, syncMealPeriods: [...source.syncMealPeriods] }],
      items: [
        {
          id: "managed",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "餐蛋面",
          normalizedName: "餐蛋面",
          mealPeriods: ["lunch"],
          isAvailable: true,
        },
        {
          id: "legacy-manual",
          canteenId: "canteen-1",
          menuSourceId: null,
          name: "餐蛋面",
          normalizedName: "餐蛋面",
          mealPeriods: ["breakfast"],
          isAvailable: true,
        },
      ],
      offerings: [
        {
          menuSourceId: "source-1",
          menuItemId: "managed",
          externalProductId: "product-1",
        },
      ],
      observations: [
        {
          menuSourceId: "source-1",
          mealPeriod: "lunch",
          runId: "lunch-run",
          observedAt: new Date("2026-08-27T03:20:00Z"),
          externalProductIds: ["product-1"],
        },
        {
          menuSourceId: "source-1",
          mealPeriod: "dinner",
          runId: "dinner-run",
          observedAt: new Date("2026-08-27T09:20:00Z"),
          externalProductIds: [],
        },
      ],
      transitions: [],
      historyTotals: {
        menuItems: 2,
        comments: 0,
        votes: 0,
        identityTransitions: 0,
      },
    });

    expect(report.ok).toBe(false);
    expect(report.sources[0].unexpectedActiveItemIds).toEqual([
      "legacy-manual",
    ]);
    expect(report.sources[0].duplicateCanonicalNames).toEqual([
      {
        normalizedName: "餐蛋面",
        menuItemIds: ["legacy-manual", "managed"],
      },
    ]);
    expect(report.sources[0].configuredOutActiveItems).toEqual([
      { id: "legacy-manual", mealPeriods: ["breakfast"] },
    ]);
  });

  it("does not fail future periods, closed days, or valid three-period allday rows", () => {
    const report = buildMenuInvariantReport({
      evaluatedAt: new Date("2026-08-27T01:00:00Z"),
      sources: [
        {
          ...source,
          syncMealPeriods: ["breakfast", "lunch", "dinner"],
          closedWeekdays: [4],
        },
      ],
      items: [
        {
          id: "allday",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "全日餐",
          normalizedName: "全日餐",
          mealPeriods: ["allday"],
          isAvailable: true,
        },
      ],
      offerings: [
        {
          menuSourceId: "source-1",
          menuItemId: "allday",
          externalProductId: "allday-product",
        },
      ],
      observations: [
        {
          menuSourceId: "source-1",
          mealPeriod: "lunch",
          runId: "yesterday-lunch",
          observedAt: new Date("2026-08-26T03:20:00Z"),
          externalProductIds: ["allday-product"],
        },
        {
          menuSourceId: "source-1",
          mealPeriod: "dinner",
          runId: "yesterday-dinner",
          observedAt: new Date("2026-08-26T09:20:00Z"),
          externalProductIds: ["allday-product"],
        },
      ],
      transitions: [],
      historyTotals: {
        menuItems: 1,
        comments: 0,
        votes: 0,
        identityTransitions: 0,
      },
    });

    expect(report.ok).toBe(true);
    expect(report.sources[0].periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ freshness: "stale", dueToday: false }),
      ]),
    );
    expect(report.sources[0].configuredOutActiveItems).toEqual([]);
  });

  it("waits for the initial drain deadline and rejects scoped allday leakage", () => {
    const makeReport = (evaluatedAt: Date) =>
      buildMenuInvariantReport({
        evaluatedAt,
        sources: [{ ...source, syncMealPeriods: [...source.syncMealPeriods] }],
        items: [
          {
            id: "allday",
            canteenId: "canteen-1",
            menuSourceId: "source-1",
            name: "全日餐",
            normalizedName: "全日餐",
            mealPeriods: ["allday"],
            isAvailable: true,
          },
        ],
        offerings: [
          {
            menuSourceId: "source-1",
            menuItemId: "allday",
            externalProductId: "allday-product",
          },
        ],
        observations: [
          {
            menuSourceId: "source-1",
            mealPeriod: "lunch",
            runId: "yesterday-lunch",
            observedAt: new Date("2026-08-26T03:20:00Z"),
            externalProductIds: ["allday-product"],
          },
          {
            menuSourceId: "source-1",
            mealPeriod: "dinner",
            runId: "yesterday-dinner",
            observedAt: new Date("2026-08-26T09:20:00Z"),
            externalProductIds: ["allday-product"],
          },
        ],
        transitions: [],
        historyTotals: {
          menuItems: 1,
          comments: 0,
          votes: 0,
          identityTransitions: 0,
        },
      });

    const duringDrain = makeReport(new Date("2026-08-27T03:40:00Z"));
    expect(duringDrain.sources[0].periods[0]).toMatchObject({
      mealPeriod: "lunch",
      freshness: "stale",
      dueToday: false,
    });
    expect(duringDrain.sources[0].problems).not.toContain("stale-period:lunch");
    expect(duringDrain.sources[0].configuredOutActiveItems).toEqual([
      { id: "allday", mealPeriods: ["allday"] },
    ]);

    const afterDeadline = makeReport(new Date("2026-08-27T03:50:00Z"));
    expect(afterDeadline.sources[0].problems).toContain("stale-period:lunch");
  });

  it("verifies that every audited merge keeps its retired UUID inactive", () => {
    const report = buildMenuInvariantReport({
      evaluatedAt: new Date("2026-08-27T10:00:00Z"),
      sources: [{ ...source, syncMealPeriods: [...source.syncMealPeriods] }],
      items: [
        {
          id: "survivor",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "A",
          normalizedName: "a",
          mealPeriods: ["lunch", "dinner"],
          isAvailable: true,
        },
        {
          id: "retired",
          canteenId: "canteen-1",
          menuSourceId: null,
          name: "A",
          normalizedName: "a",
          mealPeriods: [],
          isAvailable: true,
        },
      ],
      offerings: [
        {
          menuSourceId: "source-1",
          menuItemId: "survivor",
          externalProductId: "product",
        },
      ],
      observations: [
        {
          menuSourceId: "source-1",
          mealPeriod: "lunch",
          runId: "lunch",
          observedAt: new Date("2026-08-27T03:20:00Z"),
          externalProductIds: ["product"],
        },
        {
          menuSourceId: "source-1",
          mealPeriod: "dinner",
          runId: "dinner",
          observedAt: new Date("2026-08-27T09:20:00Z"),
          externalProductIds: ["product"],
        },
      ],
      transitions: [
        {
          menuSourceId: "source-1",
          kind: "merge",
          fromMenuItemId: "retired",
          toMenuItemId: "survivor",
        },
      ],
      historyTotals: {
        menuItems: 2,
        comments: 0,
        votes: 0,
        identityTransitions: 1,
      },
    });

    expect(report.sources[0].problems).toContain("invalid-retired-identity");
    expect(report.sources[0].retiredIdentityCount).toBe(1);
    expect(report.sources[0].invalidRetiredTransitions).toHaveLength(1);
  });
});
