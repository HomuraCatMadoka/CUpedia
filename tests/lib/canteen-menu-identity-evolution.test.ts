import { describe, expect, it } from "vitest";
import {
  planCanonicalIdentityEvolution,
  type CanonicalIdentityItem,
} from "@/lib/canteen-menu-identity-evolution";
import type { CurrentMenuProjection } from "@/lib/canteen-types";

const sourceId = "00000000-0000-4000-8000-000000000001";

function existing(
  overrides: Partial<CanonicalIdentityItem> & Pick<CanonicalIdentityItem, "id">,
): CanonicalIdentityItem {
  const { id, ...rest } = overrides;
  return {
    id,
    name: "凍檸茶",
    normalizedName: "凍檸茶",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    mealPeriods: ["lunch"],
    sortOrder: 0,
    svgKey: "飲品",
    priceOptions: [],
    menuSourceId: sourceId,
    externalProductId: "a",
    externalProductIds: ["a"],
    activeExternalProductIds: ["a"],
    providerOfferings: [
      {
        externalProductId: "a",
        normalizedName: "凍檸茶",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        isAvailable: true,
      },
    ],
    isAvailable: true,
    ...rest,
  };
}

function projection(
  items: CurrentMenuProjection["items"],
): CurrentMenuProjection {
  return {
    items,
    absenceAuthority: { kind: "none" },
  };
}

function incoming(
  externalProductId: string,
  name: string,
  sortOrder = 0,
): CurrentMenuProjection["items"][number] {
  return {
    externalProductId,
    name,
    mealPeriods: ["lunch"],
    sortOrder,
    svgKey: "飲品",
    priceOptions: [],
    occurrences: [
      {
        mealPeriod: "lunch",
        categoryKey: "飲品",
        sortOrder,
        priceOptions: [],
      },
    ],
  };
}

describe("canonical menu identity evolution", () => {
  it("keeps one UUID when its only provider offering is renamed", () => {
    const item = existing({ id: "00000000-0000-4000-8000-000000000011" });

    const result = planCanonicalIdentityEvolution({
      sourceId,
      existingItems: [item],
      projection: projection([incoming("a", "熱檸茶")]),
    });

    expect(result.renames).toEqual([
      {
        itemId: item.id,
        fromNormalizedName: "凍檸茶",
        toNormalizedName: "熱檸茶",
        externalProductIds: ["a"],
      },
    ]);
    expect(result.splits).toEqual([]);
    expect(result.merges).toEqual([]);
    expect(result.projectedItems).toHaveLength(1);
    expect(result.projectedItems[0].id).toBe(item.id);
  });

  it("splits only the renamed alias while the original UUID keeps its history", () => {
    const item = existing({
      id: "00000000-0000-4000-8000-000000000012",
      externalProductIds: ["a", "b"],
      activeExternalProductIds: ["a", "b"],
      providerOfferings: [
        {
          externalProductId: "a",
          normalizedName: "凍檸茶",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          isAvailable: true,
        },
        {
          externalProductId: "b",
          normalizedName: "凍檸茶",
          createdAt: new Date("2026-01-02T00:00:00Z"),
          isAvailable: true,
        },
      ],
    });

    const result = planCanonicalIdentityEvolution({
      sourceId,
      existingItems: [item],
      projection: projection([
        incoming("a", "凍檸茶"),
        incoming("b", "熱檸茶", 1),
      ]),
    });

    expect(result.splits).toEqual([
      {
        sourceItemId: item.id,
        targetItemId: null,
        fromNormalizedName: "凍檸茶",
        toNormalizedName: "熱檸茶",
        externalProductIds: ["b"],
      },
    ]);
    expect(result.projectedItems[0].externalProductIds).toEqual(["a"]);
    expect(result.projectedItems[0].activeExternalProductIds).toEqual(["a"]);
  });

  it("merges converged dishes into the earliest-created UUID", () => {
    const earliest = existing({
      id: "00000000-0000-4000-8000-000000000013",
      name: "紙包飲品",
      normalizedName: "紙包飲品",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      externalProductId: "old",
      externalProductIds: ["old"],
      activeExternalProductIds: [],
      providerOfferings: [
        {
          externalProductId: "old",
          normalizedName: "紙包飲品",
          createdAt: new Date("2025-01-01T00:00:00Z"),
          isAvailable: false,
        },
      ],
      isAvailable: false,
    });
    const later = existing({
      id: "00000000-0000-4000-8000-000000000014",
      name: "紙包飲品",
      normalizedName: "紙包飲品",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      externalProductId: "current",
      externalProductIds: ["current"],
      activeExternalProductIds: ["current"],
      providerOfferings: [
        {
          externalProductId: "current",
          normalizedName: "紙包飲品",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          isAvailable: true,
        },
      ],
    });

    const result = planCanonicalIdentityEvolution({
      sourceId,
      existingItems: [later, earliest],
      projection: projection([incoming("current", "紙包飲品")]),
    });

    expect(result.merges).toEqual([
      {
        survivorItemId: earliest.id,
        mergedItemIds: [later.id],
        normalizedName: "紙包飲品",
        externalProductIds: ["current", "old"],
      },
    ]);
    expect(result.projectedItems).toHaveLength(1);
    expect(result.projectedItems[0]).toMatchObject({
      id: earliest.id,
      externalProductIds: ["current", "old"],
      activeExternalProductIds: ["current"],
    });

    const repeated = planCanonicalIdentityEvolution({
      sourceId,
      existingItems: result.projectedItems,
      projection: projection([incoming("current", "紙包飲品")]),
    });
    expect(repeated.merges).toEqual([]);
    expect(repeated.splits).toEqual([]);
  });

  it("merges an existing duplicate group even when every row is inactive and absent", () => {
    const earliest = existing({
      id: "00000000-0000-4000-8000-000000000021",
      name: "過期套餐",
      normalizedName: "過期套餐",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      externalProductId: "old-a",
      externalProductIds: ["old-a"],
      activeExternalProductIds: [],
      providerOfferings: [
        {
          externalProductId: "old-a",
          normalizedName: "過期套餐",
          createdAt: new Date("2025-01-01T00:00:00Z"),
          isAvailable: false,
        },
      ],
      isAvailable: false,
    });
    const later = existing({
      id: "00000000-0000-4000-8000-000000000022",
      name: "過期套餐",
      normalizedName: "過期套餐",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      externalProductId: "old-b",
      externalProductIds: ["old-b"],
      activeExternalProductIds: [],
      providerOfferings: [
        {
          externalProductId: "old-b",
          normalizedName: "過期套餐",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          isAvailable: false,
        },
      ],
      isAvailable: false,
    });

    const result = planCanonicalIdentityEvolution({
      sourceId,
      existingItems: [later, earliest],
      projection: projection([]),
    });

    expect(result.merges).toEqual([
      {
        survivorItemId: earliest.id,
        mergedItemIds: [later.id],
        normalizedName: "過期套餐",
        externalProductIds: ["old-a", "old-b"],
      },
    ]);
  });

  it("uses the earliest provider offering as anchor when every alias renames differently", () => {
    const item = existing({
      id: "00000000-0000-4000-8000-000000000015",
      externalProductIds: ["a", "b"],
      activeExternalProductIds: ["a", "b"],
      providerOfferings: [
        {
          externalProductId: "b",
          normalizedName: "凍檸茶",
          createdAt: new Date("2026-01-02T00:00:00Z"),
          isAvailable: true,
        },
        {
          externalProductId: "a",
          normalizedName: "凍檸茶",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          isAvailable: true,
        },
      ],
    });

    const result = planCanonicalIdentityEvolution({
      sourceId,
      existingItems: [item],
      projection: projection([
        incoming("a", "檸檬茶"),
        incoming("b", "蜂蜜檸檬茶", 1),
      ]),
    });

    expect(result.renames[0]).toMatchObject({
      itemId: item.id,
      toNormalizedName: "檸檬茶",
    });
    expect(result.splits[0]).toMatchObject({
      sourceItemId: item.id,
      toNormalizedName: "蜂蜜檸檬茶",
      externalProductIds: ["b"],
    });
  });

  it("does not rename away an unobserved active alias in a partial projection", () => {
    const item = existing({
      id: "00000000-0000-4000-8000-000000000016",
      externalProductIds: ["a", "b"],
      activeExternalProductIds: ["a", "b"],
      providerOfferings: [
        {
          externalProductId: "a",
          normalizedName: "凍檸茶",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          isAvailable: true,
        },
        {
          externalProductId: "b",
          normalizedName: "凍檸茶",
          createdAt: new Date("2026-01-02T00:00:00Z"),
          isAvailable: true,
        },
      ],
    });

    const result = planCanonicalIdentityEvolution({
      sourceId,
      existingItems: [item],
      projection: projection([incoming("b", "熱檸茶")]),
    });

    expect(result.renames).toEqual([]);
    expect(result.splits).toEqual([
      expect.objectContaining({
        sourceItemId: item.id,
        toNormalizedName: "熱檸茶",
        externalProductIds: ["b"],
      }),
    ]);
    expect(result.projectedItems[0].externalProductIds).toEqual(["a"]);
  });
});
