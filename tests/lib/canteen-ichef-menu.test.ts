import { describe, expect, it, vi } from "vitest";
import {
  buildIchefMenuSyncPayload,
  mealPeriodsForIchefHour,
} from "@/lib/canteen-ichef-menu";
import { fetchIchefMenu } from "@/lib/canteen-menu-source-adapters";

describe("iCHEF menu adapter", () => {
  it("maps menu-hour ranges to every overlapping meal period", () => {
    expect(mealPeriodsForIchefHour("08:00", "10:30")).toEqual(["breakfast"]);
    expect(mealPeriodsForIchefHour("11:00", "20:01")).toEqual([
      "lunch",
      "dinner",
    ]);
    expect(mealPeriodsForIchefHour(undefined, "20:01")).toEqual(["allday"]);
  });

  it("deduplicates products shared by categories and preserves all periods", () => {
    const payload = buildIchefMenuSyncPayload(
      "store-1",
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
          name: "早餐",
          menuItemsSnapshot: [{ uuid: "item-1", name: " 雞扒 飯 ", price: 32 }],
        },
        {
          uuid: "all-day",
          name: "飯類",
          menuItemsSnapshot: [{ uuid: "item-1", name: "雞扒飯", price: 32 }],
        },
      ],
    );

    expect(payload).toMatchObject({
      source: "ichef:store-1",
      takeOverLegacyItems: true,
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      externalKey: "item-1",
      name: "雞扒 飯",
      mealPeriods: ["breakfast", "lunch", "dinner"],
      priceOptions: [{ amountMinor: 3200, currency: "HKD" }],
    });
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
    expect(() => buildIchefMenuSyncPayload("store-1", [], [])).toThrow(
      "EMPTY_ICHEF_MENU",
    );
  });
});
