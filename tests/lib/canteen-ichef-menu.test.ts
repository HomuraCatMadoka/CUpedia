import { describe, expect, it, vi } from "vitest";
import { buildIchefMenuSyncPayload } from "@/lib/canteen-ichef-menu";
import { evaluateMenuSnapshot } from "@/lib/canteen-menu-snapshot-evaluator";
import type { ExistingSyncMenuItem } from "@/lib/canteen-menu-sync";
import { mealPeriodsForOperatingWindow } from "@/lib/canteen-provider-menu-periods";
import { fetchIchefMenu } from "@/lib/canteen-menu-source-adapters";
import ichefCurrent from "./fixtures/canteen-providers/ichef-current.json";

const ICHEF_PRODUCT_UUID = "11111111-1111-4111-a111-111111111111";

describe("iCHEF menu adapter", () => {
  it("deduplicates the same iCHEF product occurrence in one category period", () => {
    const item = {
      uuid: "published-snapshot-item-1",
      ichefUuid: ICHEF_PRODUCT_UUID,
      name: "同一菜品",
      price: 10,
    };
    const payload = buildIchefMenuSyncPayload(
      [
        {
          startTime: "11:00",
          endTime: "14:00",
          categorySnapshotUuids: ["a"],
        },
      ],
      [
        {
          uuid: "a",
          name: "飯類",
          menuItemsSnapshot: [item, item],
        },
      ],
    );

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].externalProductId).toBe(ICHEF_PRODUCT_UUID);
  });

  it("maps menu-hour ranges to every overlapping meal period", () => {
    expect(mealPeriodsForOperatingWindow("08:00", "10:30")).toEqual([
      "breakfast",
    ]);
    expect(mealPeriodsForOperatingWindow("11:00", "20:01")).toEqual([
      "lunch",
      "dinner",
    ]);
    expect(mealPeriodsForOperatingWindow(undefined, "20:01")).toEqual([
      "allday",
    ]);
  });

  it("deduplicates products shared by categories and preserves all periods", () => {
    const menuHours =
      ichefCurrent.menuHoursResponse.data.restaurant.onlineOrderingMenu
        .menuHoursSnapshot;
    const categories =
      ichefCurrent.categoriesResponse.data.restaurant.onlineOrderingMenu
        .categoriesSnapshot;
    const payload = buildIchefMenuSyncPayload(menuHours, categories);

    expect(payload).not.toHaveProperty("takeOverLegacyItems");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      externalProductId: ICHEF_PRODUCT_UUID,
      name: "雞扒飯",
      mealPeriods: ["breakfast", "lunch", "dinner"],
      priceOptions: [{ amountMinor: 3200, currency: "HKD" }],
    });
  });

  it("keeps one product identity across published snapshot UUID rollovers", () => {
    const menuHours = [
      {
        startTime: "11:00",
        endTime: "20:00",
        categorySnapshotUuids: ["category-snapshot"],
      },
    ];
    const categories = (snapshotUuid: string) => [
      {
        uuid: "category-snapshot",
        name: "飯類",
        menuItemsSnapshot: [
          {
            uuid: snapshotUuid,
            ichefUuid: ICHEF_PRODUCT_UUID,
            name: "同一菜品",
            price: 32,
          },
        ],
      },
    ];
    const previous = buildIchefMenuSyncPayload(
      menuHours,
      categories("published-snapshot-before"),
    );
    const incoming = buildIchefMenuSyncPayload(
      menuHours,
      categories("published-snapshot-after"),
    );
    const previousItem = previous.items[0];
    const existingItem: ExistingSyncMenuItem = {
      id: "existing-menu-item",
      name: previousItem.name,
      mealPeriods: previousItem.mealPeriods,
      sortOrder: previousItem.sortOrder,
      svgKey: previousItem.svgKey,
      priceOptions: previousItem.priceOptions,
      menuSourceId: "11111111-1111-4111-a111-111111111111",
      externalProductId: previousItem.externalProductId,
      isAvailable: true,
    };

    const evaluation = evaluateMenuSnapshot(
      {
        id: existingItem.menuSourceId!,
        provider: "ichef",
        legacyAdoptionOpen: false,
      },
      { ...incoming, takeOverLegacyItems: false },
      [existingItem],
    );

    expect(evaluation.blockingDecision).toEqual({
      blocked: false,
      code: null,
      samples: [],
    });
    expect(previousItem.externalProductId).toBe(ICHEF_PRODUCT_UUID);
    expect(incoming.items[0].externalProductId).toBe(ICHEF_PRODUCT_UUID);
  });

  it("fails closed when duplicate iCHEF UUID rows disagree on mutable facts", () => {
    expect(() =>
      buildIchefMenuSyncPayload(
        [
          {
            startTime: "11:00",
            endTime: "14:00",
            categorySnapshotUuids: ["a", "b"],
          },
        ],
        [
          {
            uuid: "a",
            name: "A",
            menuItemsSnapshot: [
              {
                uuid: "published-a",
                ichefUuid: ICHEF_PRODUCT_UUID,
                name: "菜品 A",
                price: 10,
              },
            ],
          },
          {
            uuid: "b",
            name: "B",
            menuItemsSnapshot: [
              {
                uuid: "published-b",
                ichefUuid: ICHEF_PRODUCT_UUID,
                name: "菜品 B",
                price: 20,
              },
            ],
          },
        ],
      ),
    ).toThrowError(expect.objectContaining({ code: "COLLIDING_IDENTITY" }));
  });

  it("fails closed when duplicate iCHEF UUID rows rename at the same price", () => {
    expect(() =>
      buildIchefMenuSyncPayload(
        [{ categorySnapshotUuids: ["a", "b"] }],
        [
          {
            uuid: "a",
            name: "A",
            menuItemsSnapshot: [
              {
                uuid: "published-a",
                ichefUuid: ICHEF_PRODUCT_UUID,
                name: "菜品 A",
                price: 10,
              },
            ],
          },
          {
            uuid: "b",
            name: "B",
            menuItemsSnapshot: [
              {
                uuid: "published-b",
                ichefUuid: ICHEF_PRODUCT_UUID,
                name: "菜品 B",
                price: 10,
              },
            ],
          },
        ],
      ),
    ).toThrowError(expect.objectContaining({ code: "COLLIDING_IDENTITY" }));
  });

  it("aggregates compatible categories and retains provider order", () => {
    const categories = [
      {
        uuid: "a",
        name: "飯類",
        menuItemsSnapshot: [
          {
            uuid: "published-a",
            ichefUuid: ICHEF_PRODUCT_UUID,
            name: "同一菜品",
            price: 10,
          },
        ],
      },
      {
        uuid: "b",
        name: "飲品",
        menuItemsSnapshot: [
          {
            uuid: "published-b",
            ichefUuid: ICHEF_PRODUCT_UUID,
            name: "同一菜品",
            price: 10,
          },
        ],
      },
    ];
    const menuHours = [{ categorySnapshotUuids: ["a", "b"] }];
    const forward = buildIchefMenuSyncPayload(menuHours, categories);
    const reverse = buildIchefMenuSyncPayload(
      menuHours,
      [...categories].reverse(),
    );

    expect(forward.items).toHaveLength(1);
    expect(reverse.items).toHaveLength(1);
    expect(forward.items[0].occurrences).toEqual([
      expect.objectContaining({ categoryKey: "飯類" }),
      expect.objectContaining({ categoryKey: "飲品" }),
    ]);
    expect(reverse.items[0].occurrences).toEqual([
      expect.objectContaining({ categoryKey: "飲品" }),
      expect.objectContaining({ categoryKey: "飯類" }),
    ]);
  });

  it("keeps dish order separate from price-option order", () => {
    const secondUuid = "22222222-2222-4222-8222-222222222222";
    const payload = buildIchefMenuSyncPayload(
      [{ categorySnapshotUuids: ["a"] }],
      [
        {
          uuid: "a",
          name: "飯類",
          menuItemsSnapshot: [
            {
              uuid: "published-first",
              ichefUuid: ICHEF_PRODUCT_UUID,
              name: "第一道",
              price: 10,
            },
            {
              uuid: "published-second",
              ichefUuid: secondUuid,
              name: "第二道",
              price: 20,
            },
          ],
        },
      ],
    );
    const second = payload.items.find(
      (item) => item.externalProductId === secondUuid,
    );

    expect(second?.occurrences?.[0].sortOrder).toBe(1);
    expect(second?.occurrences?.[0].priceOptions[0].sortOrder).toBe(0);
  });

  it("fails closed instead of falling back to a snapshot UUID", () => {
    expect(() =>
      buildIchefMenuSyncPayload(
        [{ categorySnapshotUuids: ["a"] }],
        [
          {
            uuid: "a",
            name: "A",
            menuItemsSnapshot: [
              {
                uuid: "published-snapshot-only",
                name: "不能當 ID",
                price: 10,
              },
            ],
          },
        ],
      ),
    ).toThrowError(expect.objectContaining({ code: "EMPTY_IDENTITY" }));
  });

  it("runs the public GraphQL query chain against a fixed endpoint", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(ichefCurrent.menuHoursResponse)),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(ichefCurrent.categoriesResponse)),
      );

    const payload = await fetchIchefMenu("UQftKWxU", { fetchImpl });
    expect(payload.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url] of fetchImpl.mock.calls) {
      expect(String(url)).toMatch(
        /^https:\/\/shop\.ichefpos\.com\/api\/graphql\/online_restaurant\?op=/,
      );
    }
    const secondBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body)) as {
      query: string;
      variables: { categoriesSnapshotUuids: string[] };
    };
    expect(secondBody.variables.categoriesSnapshotUuids).toEqual([
      "breakfast",
      "daytime",
    ]);
    expect(secondBody.query).toContain("ichefUuid");
  });

  it("rejects empty snapshots before they can deactivate existing dishes", () => {
    expect(() => buildIchefMenuSyncPayload([], [])).toThrow("EMPTY_ICHEF_MENU");
  });

  it("rejects malformed GraphQL menu DTOs before normalization", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            restaurant: {
              onlineOrderingMenu: { menuHoursSnapshot: "not-an-array" },
            },
          },
        }),
      ),
    );

    await expect(fetchIchefMenu("UQftKWxU", { fetchImpl })).rejects.toThrow(
      "INVALID_ICHEF_MENU",
    );
  });

  it("rejects a non-string stable iCHEF UUID at the provider boundary", async () => {
    const malformedCategories = structuredClone(
      ichefCurrent.categoriesResponse,
    ) as unknown as {
      data: {
        restaurant: {
          onlineOrderingMenu: {
            categoriesSnapshot: Array<{
              menuItemsSnapshot: Array<{ ichefUuid: unknown }>;
            }>;
          };
        };
      };
    };
    malformedCategories.data.restaurant.onlineOrderingMenu.categoriesSnapshot[0].menuItemsSnapshot[0].ichefUuid = 123;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(ichefCurrent.menuHoursResponse)),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(malformedCategories)));

    await expect(fetchIchefMenu("UQftKWxU", { fetchImpl })).rejects.toThrow(
      "INVALID_ICHEF_MENU",
    );
  });

  it("rejects a malformed string stable iCHEF UUID at the provider boundary", async () => {
    const malformedCategories = structuredClone(
      ichefCurrent.categoriesResponse,
    );
    malformedCategories.data.restaurant.onlineOrderingMenu.categoriesSnapshot[0].menuItemsSnapshot[0].ichefUuid =
      "not-a-uuid";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(ichefCurrent.menuHoursResponse)),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(malformedCategories)));

    await expect(fetchIchefMenu("UQftKWxU", { fetchImpl })).rejects.toThrow(
      "INVALID_ICHEF_MENU",
    );
  });
});
