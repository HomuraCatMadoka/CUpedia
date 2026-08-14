import { describe, expect, it, vi } from "vitest";
import { buildIchefMenuSyncPayload } from "@/lib/canteen-ichef-menu";
import { mealPeriodsForOperatingWindow } from "@/lib/canteen-provider-menu-periods";
import { fetchIchefMenu } from "@/lib/canteen-menu-source-adapters";

describe("iCHEF menu adapter", () => {
  it("fails closed when the same UUID repeats in one category period", () => {
    const item = { uuid: "item-1", name: "同一菜品", price: 10 };
    expect(() =>
      buildIchefMenuSyncPayload(
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
      ),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTITY" }));
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
    const payload = buildIchefMenuSyncPayload(
      [
        {
          startTime: "08:00",
          endTime: "10:30",
          categorySnapshotUuids: ["breakfast"],
        },
        {
          startTime: "11:00",
          endTime: "20:00",
          categorySnapshotUuids: ["all-day"],
        },
      ],
      [
        {
          uuid: "breakfast",
          name: "飯類",
          menuItemsSnapshot: [{ uuid: "item-1", name: " 雞扒 飯 ", price: 32 }],
        },
        {
          uuid: "all-day",
          name: "飯類",
          menuItemsSnapshot: [{ uuid: "item-1", name: " 雞扒 飯 ", price: 32 }],
        },
      ],
    );

    expect(payload.takeOverLegacyItems).toBe(false);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      externalProductId: "item-1",
      name: "雞扒 飯",
      mealPeriods: ["breakfast", "lunch", "dinner"],
      priceOptions: [{ amountMinor: 3200, currency: "HKD" }],
    });
  });

  it("fails closed when duplicate UUID rows disagree on mutable facts", () => {
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
            menuItemsSnapshot: [{ uuid: "item-1", name: "菜品 A", price: 10 }],
          },
          {
            uuid: "b",
            name: "B",
            menuItemsSnapshot: [{ uuid: "item-1", name: "菜品 B", price: 20 }],
          },
        ],
      ),
    ).toThrowError(expect.objectContaining({ code: "COLLIDING_IDENTITY" }));
  });

  it("fails closed when duplicate UUID rows rename at the same price", () => {
    expect(() =>
      buildIchefMenuSyncPayload(
        [{ categorySnapshotUuids: ["a", "b"] }],
        [
          {
            uuid: "a",
            name: "A",
            menuItemsSnapshot: [{ uuid: "item-1", name: "菜品 A", price: 10 }],
          },
          {
            uuid: "b",
            name: "B",
            menuItemsSnapshot: [{ uuid: "item-1", name: "菜品 B", price: 10 }],
          },
        ],
      ),
    ).toThrowError(expect.objectContaining({ code: "COLLIDING_IDENTITY" }));
  });

  it("fails closed when duplicate UUID rows disagree only on category", () => {
    expect(() =>
      buildIchefMenuSyncPayload(
        [{ categorySnapshotUuids: ["a", "b"] }],
        [
          {
            uuid: "a",
            name: "飯類",
            menuItemsSnapshot: [
              { uuid: "item-1", name: "同一菜品", price: 10 },
            ],
          },
          {
            uuid: "b",
            name: "飲品",
            menuItemsSnapshot: [
              { uuid: "item-1", name: "同一菜品", price: 10 },
            ],
          },
        ],
      ),
    ).toThrowError(expect.objectContaining({ code: "COLLIDING_IDENTITY" }));
  });

  it("fails closed when an emitted item UUID is empty", () => {
    expect(() =>
      buildIchefMenuSyncPayload(
        [{ categorySnapshotUuids: ["a"] }],
        [
          {
            uuid: "a",
            name: "A",
            menuItemsSnapshot: [{ name: "不能當 ID", price: 10 }],
          },
        ],
      ),
    ).toThrowError(expect.objectContaining({ code: "EMPTY_IDENTITY" }));
  });

  it("runs the public GraphQL query chain against a fixed endpoint", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              restaurant: {
                onlineOrderingMenu: {
                  menuHoursSnapshot: [
                    {
                      startTime: "11:30",
                      endTime: "15:00",
                      categorySnapshotUuids: ["cat-1"],
                    },
                  ],
                },
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              restaurant: {
                onlineOrderingMenu: {
                  categoriesSnapshot: [
                    {
                      uuid: "cat-1",
                      name: "便當",
                      menuItemsSnapshot: [
                        { uuid: "item-1", name: "咖喱雞飯", price: 40 },
                      ],
                    },
                  ],
                },
              },
            },
          }),
        ),
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
      variables: { categoriesSnapshotUuids: string[] };
    };
    expect(secondBody.variables.categoriesSnapshotUuids).toEqual(["cat-1"]);
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
});
