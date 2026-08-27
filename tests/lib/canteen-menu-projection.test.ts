import { describe, expect, it } from "vitest";
import {
  materializeMealPeriodActivityProjection,
  projectScopedMenuObservation,
} from "@/lib/canteen-menu-projection";
import { menuPublicationIdentityFromEvidence } from "@/lib/canteen-menu-publication";
import { pinmePublicationCompatibilityKey } from "@/lib/canteen-pinme-publication";
import { menuPublicationIdentityForProvider } from "@/lib/canteen-menu-source-publication";
import { menuObservationContextAt } from "@/lib/canteen-menu-sync-window";
import type { ProviderMenuObservation } from "@/lib/canteen-types";

const SOURCE = {
  syncMealPeriods: ["breakfast", "lunch", "dinner"] as const,
};

function breakfastObservation(): ProviderMenuObservation {
  return {
    snapshotCompleteness: "partial",
    observationScope: { kind: "meal-period", mealPeriod: "breakfast" },
    items: [
      {
        externalProductId: "breakfast-item",
        name: "早餐菜品",
        priceOptions: [],
        mealPeriods: ["allday"],
        sortOrder: 0,
        svgKey: "早餐",
      },
    ],
  };
}

describe("current menu projection", () => {
  it("removes meal periods that are no longer configured (#782)", () => {
    const projection = materializeMealPeriodActivityProjection(
      "source-1",
      {
        items: [
          {
            externalProductId: "lunch-item",
            name: "午餐菜品",
            priceOptions: [],
            mealPeriods: ["lunch"],
            sortOrder: 0,
            svgKey: "午餐",
          },
        ],
        absenceAuthority: {
          kind: "current-activity",
          coveredMealPeriods: ["lunch"],
          configuredMealPeriods: ["lunch", "dinner"],
        },
      },
      [
        {
          id: "breakfast-uuid",
          menuSourceId: "source-1",
          externalProductId: "breakfast-item",
          name: "历史早餐",
          priceOptions: [],
          mealPeriods: ["breakfast"],
          sortOrder: 1,
          svgKey: "早餐",
          isAvailable: true,
        },
      ],
    );

    expect(projection.items).toEqual([
      expect.objectContaining({
        externalProductId: "lunch-item",
        mealPeriods: ["lunch"],
      }),
    ]);
  });

  it("preserves a newly configured period until that period is observed (#782)", () => {
    const projection = materializeMealPeriodActivityProjection(
      "source-1",
      {
        items: [],
        absenceAuthority: {
          kind: "current-activity",
          coveredMealPeriods: ["lunch"],
          configuredMealPeriods: ["lunch", "dinner"],
        },
      },
      [
        {
          id: "dinner-uuid",
          menuSourceId: "source-1",
          externalProductId: "known-dinner-item",
          name: "尚未重新观察的晚餐",
          priceOptions: [],
          mealPeriods: ["dinner"],
          sortOrder: 1,
          svgKey: "晚餐",
          isAvailable: true,
        },
      ],
    );

    expect(projection.items).toEqual([
      expect.objectContaining({
        externalProductId: "known-dinner-item",
        mealPeriods: ["dinner"],
      }),
    ]);
  });

  it("does not resurrect old snapshots when a removed period is re-enabled (#782)", () => {
    const projection = materializeMealPeriodActivityProjection(
      "source-1",
      {
        items: [
          {
            externalProductId: "lunch-item",
            name: "午餐菜品",
            priceOptions: [],
            mealPeriods: ["lunch"],
            sortOrder: 0,
            svgKey: "午餐",
          },
        ],
        absenceAuthority: {
          kind: "current-activity",
          coveredMealPeriods: ["lunch"],
          configuredMealPeriods: ["lunch", "dinner"],
        },
      },
      [],
      {
        dinner: [
          {
            externalProductId: "old-dinner-item",
            name: "重新启用前的晚餐",
            priceOptions: [],
            mealPeriods: ["dinner"],
            sortOrder: 0,
            svgKey: "晚餐",
          },
        ],
      },
    );

    expect(projection.items).toEqual([
      expect.objectContaining({
        externalProductId: "lunch-item",
        mealPeriods: ["lunch"],
      }),
    ]);
  });

  it("keeps a 03:05 breakfast-labelled read diagnostic-only (#743)", () => {
    const context = menuObservationContextAt(
      new Date("2026-08-24T19:05:00.000Z"),
    );

    expect(
      projectScopedMenuObservation(SOURCE, context, breakfastObservation()),
    ).toEqual({ items: [], absenceAuthority: { kind: "none" } });
  });

  it("projects an 08:17 observation only into the observed meal period", () => {
    const context = menuObservationContextAt(
      new Date("2026-08-25T00:17:00.000Z"),
    );

    expect(
      projectScopedMenuObservation(SOURCE, context, breakfastObservation()),
    ).toEqual({
      items: [
        expect.objectContaining({
          externalProductId: "breakfast-item",
          mealPeriods: ["breakfast"],
        }),
      ],
      absenceAuthority: {
        kind: "current-activity",
        coveredMealPeriods: ["breakfast"],
        configuredMealPeriods: ["breakfast", "lunch", "dinner"],
      },
    });
  });

  it("marks an explicit provider publication change without changing its meal period", () => {
    const context = menuObservationContextAt(
      new Date("2026-08-25T06:47:00.000Z"),
    );
    const observation: ProviderMenuObservation = {
      snapshotCompleteness: "partial",
      observationScope: { kind: "meal-period", mealPeriod: "lunch" },
      scopeEvidence: {
        provider: "pinme",
        menuGroupCount: 1,
        groupCount: 1,
        referencedGroupIds: ["tea"],
        serviceWindows: [{ startTime: "14:30", endTime: "17:00" }],
        publicationKey: "b".repeat(24),
      },
      items: [
        {
          externalProductId: "afternoon-item",
          name: "下午茶菜品",
          priceOptions: [],
          mealPeriods: ["lunch"],
          sortOrder: 0,
          svgKey: "下午茶",
        },
      ],
    };

    expect(
      projectScopedMenuObservation(SOURCE, context, observation, {
        previousPublicationIdentity: menuPublicationIdentityFromEvidence({
          publicationKey: "a".repeat(24),
        }),
      }).absenceAuthority,
    ).toEqual({
      kind: "current-activity",
      coveredMealPeriods: ["lunch"],
      configuredMealPeriods: ["breakfast", "lunch", "dinner"],
      publicationTransition: "changed",
    });
  });

  it("recognizes a publication switch against a pre-key PINME snapshot", () => {
    const context = menuObservationContextAt(
      new Date("2026-08-25T03:17:00.000Z"),
    );
    const currentEvidence = {
      provider: "pinme" as const,
      menuGroupCount: 1,
      groupCount: 2,
      referencedGroupIds: ["noon"],
      serviceWindows: [{ startTime: "11:00", endTime: "14:30" }],
      publicationKey: "b".repeat(24),
    };
    const publicationCompatibilityKey =
      pinmePublicationCompatibilityKey(currentEvidence);
    if (!publicationCompatibilityKey) {
      throw new Error("expected PINME compatibility identity");
    }
    const observation: ProviderMenuObservation = {
      snapshotCompleteness: "partial",
      observationScope: { kind: "meal-period", mealPeriod: "lunch" },
      scopeEvidence: {
        ...currentEvidence,
        publicationCompatibilityKey,
      },
      items: [
        {
          externalProductId: "noon-item",
          name: "午餐菜品",
          priceOptions: [],
          mealPeriods: ["lunch"],
          sortOrder: 0,
          svgKey: "午餐",
        },
      ],
    };
    const previousEvidence = {
      provider: "pinme",
      menuGroupCount: 1,
      groupCount: 2,
      referencedGroupIds: ["tea"],
      serviceWindows: [{ startTime: "14:30", endTime: "17:00" }],
    };
    expect(
      menuPublicationIdentityForProvider("aigens", previousEvidence),
    ).toBeNull();

    expect(
      projectScopedMenuObservation(SOURCE, context, observation, {
        previousPublicationIdentity: menuPublicationIdentityForProvider(
          "pinme",
          previousEvidence,
        ),
      }).absenceAuthority,
    ).toMatchObject({ publicationTransition: "changed" });
  });
});
