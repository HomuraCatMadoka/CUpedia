import { describe, expect, it } from "vitest";
import { evaluateMenuSnapshot } from "@/lib/canteen-menu-snapshot-evaluator";
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
  return parseMenuSyncJson({ items });
}

describe("menu snapshot evaluator", () => {
  it("returns canonical state, an exact-update plan, observation, and decision together", () => {
    const result = evaluateMenuSnapshot(
      SOURCE,
      parseMenuSyncJson({
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
      ambiguousOfferingTransitionCount: 0,
      ambiguousOfferingTransitionSamples: [],
    });
    expect(result.blockingDecision).toEqual({
      blocked: false,
      code: null,
      samples: [],
    });
  });

  it("blocks an ambiguous Aigens offering split with bounded redacted samples", () => {
    const result = evaluateMenuSnapshot(
      { ...SOURCE, provider: "aigens" },
      parseMenuSyncJson({
        items: [
          {
            externalProductId: "secret-product#offering-period=lunch",
            name: "午餐示例菜品",
            mealPeriods: ["lunch"],
          },
          {
            externalProductId: "secret-product#offering-period=dinner",
            name: "晚餐示例菜品",
            mealPeriods: ["dinner"],
          },
        ],
      }),
      [
        existing({
          externalProductId: "secret-product#offering-period=breakfast",
          mealPeriods: ["breakfast"],
        }),
      ],
    );

    expect(result.plan.actions).toEqual([]);
    expect(result.plan.conflicts).toHaveLength(2);
    expect(result.blockingDecision).toMatchObject({
      blocked: true,
      code: "MENU_SYNC_CONFLICT",
    });
    expect(result.blockingDecision.samples.length).toBeGreaterThan(0);
    expect(result.blockingDecision.samples.length).toBeLessThanOrEqual(5);
    expect(result.blockingDecision.samples).toEqual(
      result.blockingDecision.samples.map(() =>
        expect.stringMatching(/^[a-f0-9]{12}$/),
      ),
    );
    expect(JSON.stringify(result.blockingDecision)).not.toContain("secret");
  });

  it("observes but never joins a same-name product replacement", () => {
    const result = evaluateMenuSnapshot(
      SOURCE,
      parseMenuSyncJson({
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

  it("reactivates a known identity without counting it as a new product", () => {
    const result = evaluateMenuSnapshot(
      SOURCE,
      parseMenuSyncJson({
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
      name: "mixed exact and residual offering move",
      source: { ...SOURCE, provider: "aigens" as const },
      input: snapshot([
        {
          externalProductId: "a#offering-period=breakfast",
          name: "移动菜品",
          mealPeriods: ["breakfast"],
        },
        {
          externalProductId: "b#offering-period=dinner",
          name: "精确菜品",
          mealPeriods: ["dinner"],
        },
      ]),
      persisted: [
        existing({
          id: "moved-item",
          externalProductId: "a#offering-period=lunch",
          mealPeriods: ["lunch"],
        }),
        existing({
          id: "exact-item",
          externalProductId: "b#offering-period=dinner",
          name: "精确菜品",
          mealPeriods: ["dinner"],
        }),
      ],
      code: null,
    },
    {
      name: "offering split",
      source: { ...SOURCE, provider: "aigens" as const },
      input: snapshot([
        {
          externalProductId: "a#offering-period=lunch",
          name: "午餐菜品",
          mealPeriods: ["lunch"],
        },
        {
          externalProductId: "a#offering-period=dinner",
          name: "晚餐菜品",
          mealPeriods: ["dinner"],
        },
      ]),
      persisted: [
        existing({
          externalProductId: "a#offering-period=breakfast",
          mealPeriods: ["breakfast"],
        }),
      ],
      code: "MENU_SYNC_CONFLICT",
    },
    {
      name: "offering merge",
      source: { ...SOURCE, provider: "aigens" as const },
      input: snapshot([
        {
          externalProductId: "a#offering-period=breakfast",
          name: "合并菜品",
          mealPeriods: ["breakfast"],
        },
      ]),
      persisted: [
        existing({
          id: "lunch-item",
          externalProductId: "a#offering-period=lunch",
          mealPeriods: ["lunch"],
        }),
        existing({
          id: "dinner-item",
          externalProductId: "a#offering-period=dinner",
          mealPeriods: ["dinner"],
        }),
      ],
      code: "MENU_SYNC_CONFLICT",
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
