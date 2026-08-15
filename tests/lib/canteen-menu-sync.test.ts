import { describe, expect, it } from "vitest";
import {
  planMenuSync,
  type ExistingSyncMenuItem,
} from "@/lib/canteen-menu-sync";
import { parseMenuSyncJson } from "@/lib/canteen-types";

const SOURCE_ID = "11111111-1111-4111-a111-111111111111";

function existing(
  overrides: Partial<ExistingSyncMenuItem> = {},
): ExistingSyncMenuItem {
  return {
    id: "item-1",
    name: "凍奶茶",
    mealPeriods: ["lunch"],
    sortOrder: 0,
    svgKey: "drink",
    priceOptions: [],
    menuSourceId: null,
    externalProductId: null,
    isAvailable: true,
    ...overrides,
  };
}

function input(name = "凍奶茶") {
  return parseMenuSyncJson({
    items: [
      {
        externalProductId: "product-42",
        name,
        mealPeriods: ["lunch"],
        svgKey: "drink",
      },
    ],
  });
}

describe("menu sync planner", () => {
  it("requires explicit takeover before claiming a matching manual row", () => {
    const plan = planMenuSync(SOURCE_ID, input(), [existing()]);
    expect(plan.actions).toEqual([]);
    expect(plan.conflicts[0]).toMatchObject({
      reason: "LEGACY_MATCH_REQUIRES_TAKEOVER",
      candidateIds: ["item-1"],
    });
  });

  it("claims the same UUID during explicit takeover", () => {
    const plan = planMenuSync(
      SOURCE_ID,
      { ...input(), takeOverLegacyItems: true },
      [existing()],
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.actions[0]).toMatchObject({
      action: "claim",
      itemId: "item-1",
    });
  });

  it("uses source plus product ID across rename and period changes", () => {
    const changed = parseMenuSyncJson({
      items: [
        {
          externalProductId: "product-42",
          name: "港式凍奶茶",
          mealPeriods: ["dinner"],
          svgKey: "drink",
        },
      ],
    });
    const plan = planMenuSync(SOURCE_ID, changed, [
      existing({ menuSourceId: SOURCE_ID, externalProductId: "product-42" }),
    ]);
    expect(plan.actions[0]).toMatchObject({
      action: "update",
      itemId: "item-1",
      externalProductId: "product-42",
      changedFields: ["name", "mealPeriods"],
    });
  });

  it("preserves a UUID when one period-scoped offering moves periods", () => {
    const changed = parseMenuSyncJson({
      items: [
        {
          externalProductId: "product-42#offering-period=dinner",
          name: "港式凍奶茶",
          mealPeriods: ["dinner"],
          svgKey: "drink",
        },
      ],
    });
    const plan = planMenuSync(SOURCE_ID, changed, [
      existing({
        menuSourceId: SOURCE_ID,
        externalProductId: "product-42#offering-period=lunch",
      }),
    ]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.actions).toEqual([
      expect.objectContaining({
        action: "update",
        itemId: "item-1",
        externalProductId: "product-42#offering-period=dinner",
        changedFields: expect.arrayContaining([
          "externalIdentity",
          "name",
          "mealPeriods",
        ]),
      }),
    ]);
  });

  it("fails closed across an ambiguous period split", () => {
    const split = parseMenuSyncJson({
      items: [
        {
          externalProductId: "product-42#offering-period=lunch",
          name: "午餐凍奶茶",
          mealPeriods: ["lunch"],
        },
        {
          externalProductId: "product-42#offering-period=dinner",
          name: "晚餐凍奶茶",
          mealPeriods: ["dinner"],
        },
      ],
    });
    const plan = planMenuSync(SOURCE_ID, split, [
      existing({
        menuSourceId: SOURCE_ID,
        externalProductId: "product-42#offering-period=breakfast",
      }),
    ]);
    expect(plan.actions).toEqual([]);
    expect(plan.conflicts).toEqual([
      {
        externalProductId: "product-42#offering-period=lunch",
        name: "午餐凍奶茶",
        reason: "AMBIGUOUS_EXTERNAL_IDENTITY_TRANSITION",
        candidateIds: ["item-1"],
      },
      {
        externalProductId: "product-42#offering-period=dinner",
        name: "晚餐凍奶茶",
        reason: "AMBIGUOUS_EXTERNAL_IDENTITY_TRANSITION",
        candidateIds: ["item-1"],
      },
    ]);
  });

  it("still fails closed on an ambiguous split in a partial snapshot", () => {
    const split = parseMenuSyncJson({
      snapshotCompleteness: "partial",
      items: [
        {
          externalProductId: "product-42#offering-period=lunch",
          name: "午餐凍奶茶",
          mealPeriods: ["lunch"],
        },
        {
          externalProductId: "product-42#offering-period=dinner",
          name: "晚餐凍奶茶",
          mealPeriods: ["dinner"],
        },
      ],
    });
    const plan = planMenuSync(SOURCE_ID, split, [
      existing({
        menuSourceId: SOURCE_ID,
        externalProductId: "product-42#offering-period=breakfast",
      }),
    ]);

    expect(plan.actions).toEqual([]);
    expect(plan.conflicts).toHaveLength(2);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "AMBIGUOUS_EXTERNAL_IDENTITY_TRANSITION",
          candidateIds: ["item-1"],
        }),
      ]),
    );
  });

  it("preserves the unmatched UUID after removing exact period matches", () => {
    const changed = parseMenuSyncJson({
      items: [
        {
          externalProductId: "product-42#offering-period=dinner",
          name: "晚餐凍奶茶",
          mealPeriods: ["dinner"],
        },
        {
          externalProductId: "product-42#offering-period=breakfast",
          name: "早餐凍奶茶",
          mealPeriods: ["breakfast"],
        },
      ],
    });
    const plan = planMenuSync(SOURCE_ID, changed, [
      existing({
        id: "lunch-item",
        menuSourceId: SOURCE_ID,
        externalProductId: "product-42#offering-period=lunch",
      }),
      existing({
        id: "dinner-item",
        menuSourceId: SOURCE_ID,
        externalProductId: "product-42#offering-period=dinner",
        name: "晚餐凍奶茶",
        mealPeriods: ["dinner"],
      }),
    ]);

    expect(plan.conflicts).toEqual([]);
    expect(plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "update",
          itemId: "lunch-item",
          externalProductId: "product-42#offering-period=breakfast",
          changedFields: expect.arrayContaining(["externalIdentity"]),
        }),
      ]),
    );
    expect(
      plan.actions.some(
        (action) =>
          action.action === "deactivate" || action.action === "create",
      ),
    ).toBe(false);
  });

  it("does not infer an offering-period move from a partial snapshot", () => {
    const plan = planMenuSync(
      SOURCE_ID,
      {
        ...parseMenuSyncJson({
          items: [
            {
              externalProductId: "product-42#offering-period=dinner",
              name: "晚餐凍奶茶",
              mealPeriods: ["dinner"],
            },
          ],
        }),
        snapshotCompleteness: "partial",
      },
      [
        existing({
          menuSourceId: SOURCE_ID,
          externalProductId: "product-42#offering-period=lunch",
        }),
      ],
    );

    expect(plan.actions).toEqual([
      expect.objectContaining({
        action: "create",
        externalProductId: "product-42#offering-period=dinner",
      }),
    ]);
  });

  it("does not match the same product ID from another source", () => {
    const plan = planMenuSync(SOURCE_ID, input("新菜"), [
      existing({
        menuSourceId: "22222222-2222-4222-a222-222222222222",
        externalProductId: "product-42",
      }),
    ]);
    expect(plan.actions).toEqual([
      expect.objectContaining({ action: "create", name: "新菜" }),
    ]);
  });

  it("deactivates missing managed rows but leaves manual rows alone", () => {
    const plan = planMenuSync(SOURCE_ID, input("新菜"), [
      existing({ menuSourceId: SOURCE_ID, externalProductId: "old-product" }),
      existing({ id: "manual-item", name: "手工菜" }),
    ]);
    expect(plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "create", name: "新菜" }),
        expect.objectContaining({ action: "deactivate", itemId: "item-1" }),
      ]),
    );
    expect(plan.actions.some((action) => action.itemId === "manual-item")).toBe(
      false,
    );
  });

  it("preserves managed rows absent from a partial provider snapshot", () => {
    const plan = planMenuSync(
      SOURCE_ID,
      { ...input("时段新品"), snapshotCompleteness: "partial" },
      [
        existing({
          menuSourceId: SOURCE_ID,
          externalProductId: "outside-current-window",
        }),
      ],
    );

    expect(plan.actions).toEqual([
      expect.objectContaining({ action: "create", name: "时段新品" }),
    ]);
    expect(plan.actions.some((action) => action.action === "deactivate")).toBe(
      false,
    );
  });

  it("forbids legacy takeover from a partial provider snapshot", () => {
    expect(() =>
      planMenuSync(
        SOURCE_ID,
        {
          ...input(),
          snapshotCompleteness: "partial",
          takeOverLegacyItems: true,
        },
        [existing()],
      ),
    ).toThrow("PARTIAL_SNAPSHOT_LEGACY_TAKEOVER_FORBIDDEN");
  });

  it("rejects duplicate product IDs in one snapshot", () => {
    expect(() =>
      parseMenuSyncJson({
        items: [
          { externalProductId: "same", name: "A" },
          { externalProductId: "same", name: "B" },
        ],
      }),
    ).toThrow("DUPLICATE_EXTERNAL_PRODUCT_ID");
  });

  it("ignores retired manual rows after the one-time adoption closes", () => {
    const plan = planMenuSync(
      SOURCE_ID,
      input(),
      [existing({ isAvailable: false })],
      false,
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.actions).toEqual([
      expect.objectContaining({ action: "create", name: "凍奶茶" }),
    ]);
  });
});
