import { describe, expect, it } from "vitest";
import {
  planMenuSync,
  type ExistingSyncMenuItem,
} from "@/lib/canteen-menu-sync";
import { parseMenuSyncJson } from "@/lib/canteen-types";

function existing(
  overrides: Partial<ExistingSyncMenuItem> = {},
): ExistingSyncMenuItem {
  return {
    id: "item-1",
    name: "凍奶茶",
    mealPeriod: "lunch",
    sortOrder: 0,
    svgKey: "drink",
    priceOptions: [],
    externalSource: null,
    externalKey: null,
    isAvailable: true,
    ...overrides,
  };
}

function input(name = "凍奶茶") {
  return parseMenuSyncJson({
    source: "order-place:102830",
    items: [
      {
        externalKey: "product-42:lunch",
        name,
        mealPeriod: "lunch",
        svgKey: "drink",
      },
    ],
  });
}

describe("menu sync planner", () => {
  it("claims a unique legacy name and period match without replacing its id", () => {
    const plan = planMenuSync(input(), [existing()]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.actions[0]).toMatchObject({
      action: "claim",
      itemId: "item-1",
    });
  });

  it("keeps matching by external key after an upstream rename", () => {
    const plan = planMenuSync(input("港式凍奶茶"), [
      existing({
        externalSource: "order-place:102830",
        externalKey: "product-42:lunch",
      }),
    ]);
    expect(plan.actions[0]).toMatchObject({
      action: "update",
      itemId: "item-1",
      changedFields: ["name"],
    });
  });

  it("deactivates missing source items but leaves manual items alone", () => {
    const plan = planMenuSync(input("新菜"), [
      existing({
        externalSource: "order-place:102830",
        externalKey: "old-product:lunch",
      }),
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

  it("deactivates unmatched legacy items during an explicit first takeover", () => {
    const takeoverInput = { ...input("新菜"), takeOverLegacyItems: true };
    const plan = planMenuSync(takeoverInput, [existing({ name: "旧菜" })]);
    expect(plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "deactivate", itemId: "item-1" }),
      ]),
    );
  });

  it("reports ambiguous legacy matches instead of guessing", () => {
    const plan = planMenuSync(input(), [
      existing(),
      existing({ id: "item-2" }),
    ]);
    expect(plan.actions).toEqual([]);
    expect(plan.conflicts[0]).toMatchObject({
      reason: "AMBIGUOUS_LEGACY_MATCH",
      candidateIds: ["item-1", "item-2"],
    });
  });

  it("does not let two upstream products claim the same legacy item", () => {
    const duplicateNameInput = parseMenuSyncJson({
      source: "order-place:102830",
      items: [
        { externalKey: "product-a:lunch", name: "凍奶茶" },
        { externalKey: "product-b:lunch", name: "凍奶茶" },
      ],
    });
    const plan = planMenuSync(duplicateNameInput, [existing()]);
    expect(plan.actions).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({
      externalKey: "product-b:lunch",
      reason: "LEGACY_MATCH_ALREADY_CLAIMED",
      candidateIds: ["item-1"],
    });
  });

  it("rejects duplicate external keys in one snapshot", () => {
    expect(() =>
      parseMenuSyncJson({
        source: "order-place:102830",
        items: [
          { externalKey: "same", name: "A" },
          { externalKey: "same", name: "B" },
        ],
      }),
    ).toThrow("DUPLICATE_EXTERNAL_KEY");
  });
});
