import { describe, expect, it } from "vitest";
import {
  evaluateCurrentMenuProjection,
  evaluateMenuSnapshot,
  resolveApprovedIdentityTransitionBlocking,
} from "@/lib/canteen-menu-snapshot-evaluator";
import type { ExistingSyncMenuItem } from "@/lib/canteen-menu-sync";
import { parseMenuSyncJson } from "@/lib/canteen-types";

const SOURCE = {
  id: "11111111-1111-4111-a111-111111111111",
  provider: "pinme" as const,
  legacyAdoptionOpen: false,
};

function existing(
  overrides: Partial<ExistingSyncMenuItem> = {},
): ExistingSyncMenuItem {
  return {
    id: "item-1",
    name: "示例菜品",
    mealPeriods: ["lunch"],
    sortOrder: 0,
    svgKey: "示例分类",
    priceOptions: [],
    menuSourceId: SOURCE.id,
    externalProductId: "product-42#period=lunch",
    isAvailable: true,
    ...overrides,
  };
}

function snapshot(
  items: Array<{
    externalProductId: string;
    name: string;
    mealPeriods?: string[];
  }>,
) {
  return parseMenuSyncJson({ snapshotCompleteness: "complete", items });
}

describe("menu snapshot evaluator", () => {
  it("rejects an empty snapshot outside the adapter-approved recurring path", () => {
    expect(() =>
      evaluateMenuSnapshot(
        SOURCE,
        {
          snapshotCompleteness: "complete",
          takeOverLegacyItems: false,
          items: [],
        },
        [existing()],
      ),
    ).toThrowError(expect.objectContaining({ code: "EMPTY_SNAPSHOT" }));
  });

  it("returns canonical state, an exact-update plan, observation, and decision together", () => {
    const result = evaluateMenuSnapshot(
      SOURCE,
      parseMenuSyncJson({
        snapshotCompleteness: "complete",
        items: [
          {
            externalProductId: "product-42",
            name: "更新后的示例菜品",
            mealPeriods: ["dinner"],
            svgKey: "示例分类",
          },
        ],
      }),
      [existing()],
    );

    expect(result.canonicalState).toMatchObject({
      input: { items: [{ externalProductId: "product-42" }] },
      existingItems: [{ externalProductId: "product-42" }],
    });
    expect(result.plan).toMatchObject({
      conflicts: [],
      actions: [
        {
          action: "update",
          itemId: "item-1",
          externalProductId: "product-42",
          changedFields: ["name", "mealPeriods"],
        },
      ],
    });
    expect(result.identityObservation).toMatchObject({
      newProductCount: 0,
      missingProductCount: 0,
      suspectedReplacementCount: 0,
      suspectedReplacementSamples: [],
    });
    expect(result.blockingDecision).toEqual({
      blocked: false,
      code: null,
      samples: [],
    });
  });

  it("rejects historical Aigens period aliases before ordinary evaluation", () => {
    expect(() =>
      evaluateMenuSnapshot(
        { ...SOURCE, provider: "aigens" },
        parseMenuSyncJson({
          snapshotCompleteness: "complete",
          items: [{ externalProductId: "secret-product", name: "示例菜品" }],
        }),
        [
          existing({
            externalProductId: "secret-product#offering-period=lunch",
          }),
        ],
      ),
    ).toThrow("MALFORMED_IDENTITY");
  });

  it("observes but never joins a same-name product replacement", () => {
    const result = evaluateMenuSnapshot(
      SOURCE,
      parseMenuSyncJson({
        snapshotCompleteness: "complete",
        items: [
          {
            externalProductId: "secret-new-id",
            name: "同名示例菜品",
            mealPeriods: ["lunch"],
          },
        ],
      }),
      [
        existing({
          externalProductId: "secret-old-id",
          name: "同名示例菜品",
        }),
      ],
    );

    expect(result.plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "create", itemId: null }),
        expect.objectContaining({ action: "deactivate", itemId: "item-1" }),
      ]),
    );
    expect(
      result.plan.actions.some(
        (action) => action.action === "update" && action.itemId === "item-1",
      ),
    ).toBe(false);
    expect(result.identityObservation.suspectedReplacementCount).toBe(1);
    expect(result.identityObservation.suspectedReplacementSamples).toHaveLength(
      1,
    );
    expect(JSON.stringify(result.identityObservation)).not.toContain("secret");
    expect(JSON.stringify(result.identityObservation)).not.toContain(
      "同名示例菜品",
    );
    expect(result.blockingDecision).toMatchObject({
      blocked: true,
      code: "MENU_SYNC_IDENTITY_CHURN",
    });
    expect(JSON.stringify(result.blockingDecision)).not.toContain("secret");
  });

  it("blocks a suspicious drop after planning missing products", () => {
    const persisted = ["a", "b", "c", "d"].map((externalProductId, index) =>
      existing({
        id: `item-${index}`,
        externalProductId,
        name: `示例菜品 ${index}`,
      }),
    );
    const result = evaluateMenuSnapshot(
      SOURCE,
      parseMenuSyncJson({
        snapshotCompleteness: "complete",
        items: [
          { externalProductId: "a", name: "示例菜品 0" },
          { externalProductId: "b", name: "示例菜品 1" },
        ],
      }),
      persisted,
    );

    expect(result.identityObservation).toMatchObject({
      newProductCount: 0,
      missingProductCount: 2,
    });
    expect(
      result.plan.actions.filter((action) => action.action === "deactivate"),
    ).toHaveLength(2);
    expect(result.blockingDecision).toMatchObject({
      blocked: true,
      code: "MENU_SYNC_SUSPICIOUS_DROP",
    });
  });

  it("allows a production-sized missing-only current-activity contraction (#743)", () => {
    const persisted = Array.from({ length: 249 }, (_, index) =>
      existing({
        id: `item-${index}`,
        externalProductId: `product-${index}`,
        name: `菜品 ${index}`,
      }),
    );
    const result = evaluateCurrentMenuProjection(
      SOURCE,
      {
        absenceAuthority: {
          kind: "current-activity",
          coveredMealPeriods: ["breakfast", "lunch", "dinner"],
        },
        items: persisted.slice(0, 150).map((item) => ({
          externalProductId: item.externalProductId!,
          name: item.name,
          priceOptions: item.priceOptions,
          mealPeriods: item.mealPeriods,
          sortOrder: item.sortOrder,
          svgKey: item.svgKey,
        })),
      },
      persisted,
    );

    expect(result.identityObservation).toMatchObject({
      newProductCount: 0,
      missingProductCount: 99,
      suspectedReplacementCount: 0,
    });
    expect(
      result.plan.actions.filter((action) => action.action === "deactivate"),
    ).toHaveLength(99);
    expect(result.blockingReasons).toEqual([]);
    expect(result.blockingDecision).toEqual({
      blocked: false,
      code: null,
      samples: [],
    });
  });

  it("observes absences without blocking or deactivating a partial snapshot", () => {
    const persisted = ["a", "b", "c", "d"].map((externalProductId, index) =>
      existing({
        id: `item-${index}`,
        externalProductId,
        name: `示例菜品 ${index}`,
      }),
    );
    const result = evaluateMenuSnapshot(
      SOURCE,
      {
        ...snapshot([{ externalProductId: "new-a", name: "时段新品" }]),
        snapshotCompleteness: "partial",
      },
      persisted,
    );

    expect(result.identityObservation).toMatchObject({
      newProductCount: 1,
      missingProductCount: 4,
    });
    expect(
      result.plan.actions.some((action) => action.action === "deactivate"),
    ).toBe(false);
    expect(result.blockingReasons).toEqual([]);
    expect(result.blockingDecision.blocked).toBe(false);
  });

  it("treats a pure addition surge in a partial observation as ordinary growth", () => {
    const persisted = ["old-a"].map((externalProductId, index) =>
      existing({
        id: `item-${index}`,
        externalProductId,
        name: `旧时段菜品 ${index}`,
      }),
    );
    const result = evaluateMenuSnapshot(
      SOURCE,
      {
        ...snapshot(
          ["new-a", "new-b", "new-c"].map((externalProductId, index) => ({
            externalProductId,
            name: `新时段菜品 ${index}`,
          })),
        ),
        snapshotCompleteness: "partial",
      },
      persisted,
    );

    expect(result.identityObservation).toMatchObject({
      newProductCount: 3,
      missingProductCount: 1,
      suspectedReplacementCount: 0,
    });
    expect(
      result.plan.actions.filter((action) => action.action === "create"),
    ).toHaveLength(3);
    expect(
      result.plan.actions.some((action) => action.action === "deactivate"),
    ).toBe(false);
    expect(result.blockingReasons).toEqual([]);
    expect(result.blockingDecision.blocked).toBe(false);
  });

  it("still blocks a same-name identity replacement in a partial observation", () => {
    const result = evaluateMenuSnapshot(
      SOURCE,
      {
        ...snapshot([{ externalProductId: "new-product", name: "同一道菜" }]),
        snapshotCompleteness: "partial",
      },
      [
        existing({
          externalProductId: "old-product",
          name: "同一道菜",
        }),
      ],
    );

    expect(result.identityObservation.suspectedReplacementCount).toBe(1);
    expect(result.blockingDecision).toMatchObject({
      blocked: true,
      code: "MENU_SYNC_IDENTITY_CHURN",
    });
    expect(
      result.plan.actions.some((action) => action.action === "deactivate"),
    ).toBe(false);
  });

  it("retains every independently applicable blocking reason", () => {
    const persisted = ["old-a", "old-b", "old-c", "old-d"].map(
      (externalProductId, index) =>
        existing({
          id: `item-${index}`,
          externalProductId,
          name: `旧菜品 ${index}`,
        }),
    );
    const result = evaluateMenuSnapshot(
      SOURCE,
      snapshot([{ externalProductId: "new-a", name: "新菜品" }]),
      persisted,
    );

    expect(result.blockingReasons.map((reason) => reason.code)).toEqual([
      "MENU_SYNC_IDENTITY_CHURN",
      "MENU_SYNC_SUSPICIOUS_DROP",
    ]);
    expect(result.blockingDecision.code).toBe("MENU_SYNC_IDENTITY_CHURN");
  });

  it("resolves reviewed identity-transition reasons as one evaluation", () => {
    const persisted = ["old-a", "old-b", "old-c", "old-d"].map(
      (externalProductId, index) =>
        existing({
          id: `item-${index}`,
          externalProductId,
          name: `旧菜品 ${index}`,
        }),
    );
    const evaluation = evaluateMenuSnapshot(
      SOURCE,
      snapshot([{ externalProductId: "new-a", name: "新菜品" }]),
      persisted,
    );

    const resolved = resolveApprovedIdentityTransitionBlocking(evaluation);

    expect(resolved.blockingReasons).toEqual([]);
    expect(resolved.blockingDecision).toEqual({
      blocked: false,
      code: null,
      samples: [],
    });
  });

  it("reactivates a known identity without counting it as a new product", () => {
    const result = evaluateMenuSnapshot(
      SOURCE,
      parseMenuSyncJson({
        snapshotCompleteness: "complete",
        items: [{ externalProductId: "product-42", name: "恢复供应菜品" }],
      }),
      [
        existing({
          externalProductId: "product-42#period=lunch",
          isAvailable: false,
        }),
      ],
    );

    expect(result.plan.actions).toEqual([
      expect.objectContaining({ action: "reactivate", itemId: "item-1" }),
    ]);
    expect(result.identityObservation).toMatchObject({
      newProductCount: 0,
      missingProductCount: 0,
    });
    expect(result.blockingDecision.blocked).toBe(false);
  });

  it("is deterministic when the persisted projection order changes", () => {
    const persisted = ["old-a", "old-b", "old-c", "old-d"].map(
      (externalProductId, index) =>
        existing({
          id: `item-${index}`,
          externalProductId,
          name: `旧菜品 ${externalProductId}`,
        }),
    );
    const incoming = snapshot(
      ["new-a", "new-b", "new-c", "new-d"].map((externalProductId) => ({
        externalProductId,
        name: `新菜品 ${externalProductId}`,
      })),
    );

    expect(
      evaluateMenuSnapshot(SOURCE, incoming, [...persisted].reverse()),
    ).toEqual(evaluateMenuSnapshot(SOURCE, incoming, persisted));
  });

  it.each([
    {
      name: "exact update",
      source: SOURCE,
      input: snapshot([{ externalProductId: "a", name: "更新菜品" }]),
      persisted: [existing({ externalProductId: "a" })],
      code: null,
    },
    {
      name: "reactivation",
      source: SOURCE,
      input: snapshot([{ externalProductId: "a", name: "恢复菜品" }]),
      persisted: [existing({ externalProductId: "a", isAvailable: false })],
      code: null,
    },
    {
      name: "missing product",
      source: SOURCE,
      input: snapshot(
        ["a", "b", "c"].map((id) => ({
          externalProductId: id,
          name: `菜品 ${id}`,
        })),
      ),
      persisted: ["a", "b", "c", "d"].map((id, index) =>
        existing({
          id: `item-${index}`,
          externalProductId: id,
          name: `菜品 ${id}`,
        }),
      ),
      code: null,
    },
    {
      name: "suspicious drop",
      source: SOURCE,
      input: snapshot(
        ["a", "b"].map((id) => ({
          externalProductId: id,
          name: `菜品 ${id}`,
        })),
      ),
      persisted: ["a", "b", "c", "d"].map((id, index) =>
        existing({
          id: `item-${index}`,
          externalProductId: id,
          name: `菜品 ${id}`,
        }),
      ),
      code: "MENU_SYNC_SUSPICIOUS_DROP",
    },
    {
      name: "wholesale product ID churn",
      source: SOURCE,
      input: snapshot(
        ["new-a", "new-b", "new-c", "new-d"].map((id) => ({
          externalProductId: id,
          name: `新菜品 ${id}`,
        })),
      ),
      persisted: ["old-a", "old-b", "old-c", "old-d"].map((id, index) =>
        existing({
          id: `item-${index}`,
          externalProductId: id,
          name: `旧菜品 ${id}`,
        }),
      ),
      code: "MENU_SYNC_IDENTITY_CHURN",
    },
  ])(
    "classifies $name with the shared snapshot policy",
    ({ source, input, persisted, code }) => {
      expect(
        evaluateMenuSnapshot(source, input, persisted).blockingDecision.code,
      ).toBe(code);
    },
  );
});
