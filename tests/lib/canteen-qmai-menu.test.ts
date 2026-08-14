import { describe, expect, it, vi } from "vitest";
import { fetchQmaiMenu } from "@/lib/canteen-menu-source-adapters";
import { buildQmaiMenuSyncPayload } from "@/lib/canteen-qmai-menu";
import qmaiCurrent from "./fixtures/canteen-providers/qmai-current.json";

const menuResponse = qmaiCurrent;

describe("Qmai menu adapter", () => {
  it("fails closed when the same goods ID repeats in one sale period", () => {
    const duplicateResponse = structuredClone(menuResponse);
    const item = duplicateResponse.data.categoryItems[0].itemList[0];
    duplicateResponse.data.categoryItems[0].itemList.unshift(
      structuredClone(item),
    );
    expect(() => buildQmaiMenuSyncPayload(duplicateResponse)).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_IDENTITY" }),
    );
  });

  it("merges the same goods ID across disjoint sale periods", () => {
    const repeatedResponse = structuredClone(menuResponse);
    const dinnerItem = structuredClone(
      repeatedResponse.data.categoryItems[0].itemList[0],
    );
    dinnerItem.saleTime = {
      weekTimeList: [{ startTime: "17:00", endTime: "20:00" }],
    };
    repeatedResponse.data.categoryItems[0].itemList.push(dinnerItem);

    expect(buildQmaiMenuSyncPayload(repeatedResponse).items[0]).toMatchObject({
      externalProductId: "goods-1",
      mealPeriods: ["lunch", "dinner"],
    });
  });

  it("normalizes available products, variants, and sale windows", () => {
    const result = buildQmaiMenuSyncPayload(menuResponse);

    expect(result.items).toEqual([
      expect.objectContaining({
        externalProductId: "goods-1",
        name: "牛肉麵",
        mealPeriods: ["lunch"],
        priceOptions: [
          { label: "細麵", amountMinor: 3500, currency: "HKD", sortOrder: 0 },
          { label: "粗麵", amountMinor: 3800, currency: "HKD", sortOrder: 1 },
        ],
      }),
    ]);
  });

  it("uses an ephemeral visitor token for the menu request", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 0, status: true, data: { token: "visitor" } }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(menuResponse)));

    const result = await fetchQmaiMenu(
      "331725",
      { fetchImpl },
      { orderType: 1, locale: "zh-HK" },
      "221033",
    );

    expect(result.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("mini-app-login");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("category-item");
    const menuInit = fetchImpl.mock.calls[1][1];
    expect(new Headers(menuInit?.headers).get("Qm-User-Token")).toBe("visitor");
    expect(JSON.parse(String(menuInit?.body))).toMatchObject({
      orderType: 1,
      storeId: 331725,
      version: 3,
    });
    expect(JSON.parse(String(menuInit?.body)).buyTime).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });

  it("requires the actual multi-store id", async () => {
    await expect(fetchQmaiMenu("221033", {}, {}, null)).rejects.toThrow(
      "INVALID_MENU_SOURCE_CONFIG",
    );
  });

  it("uses a later valid duplicate when the first occurrence is unavailable", () => {
    const duplicateResponse = structuredClone(menuResponse);
    const categories = duplicateResponse.data.categoryItems;
    categories.unshift({
      available: 1,
      categoryName: "暂停售",
      itemList: [
        {
          goodsId: "goods-1",
          name: "牛肉麵（暂停）",
          stockStatus: 0,
          totalInventory: 0,
          skuList: [{ skuId: "unavailable", salePrice: 1 }],
        },
      ],
    });

    expect(buildQmaiMenuSyncPayload(duplicateResponse).items).toEqual([
      expect.objectContaining({
        externalProductId: "goods-1",
        name: "牛肉麵",
      }),
    ]);
  });

  it("fails closed when available duplicate IDs disagree", () => {
    const duplicateResponse = structuredClone(menuResponse);
    const collidingItem = structuredClone(
      duplicateResponse.data.categoryItems[0].itemList[0],
    );
    collidingItem.name = "身份碰撞菜品";
    collidingItem.skuList = [
      {
        skuId: "collision",
        salePrice: 99,
        skuItemList: [{ itemName: "碰撞規格" }],
      },
    ];
    duplicateResponse.data.categoryItems.push({
      available: 1,
      categoryName: "另一分類",
      itemList: [collidingItem],
    });
    expect(() => buildQmaiMenuSyncPayload(duplicateResponse)).toThrowError(
      expect.objectContaining({ code: "COLLIDING_IDENTITY" }),
    );
  });

  it("fails closed when an available item ID is empty", () => {
    const malformed = structuredClone(menuResponse);
    malformed.data.categoryItems[0].itemList[0].goodsId = "";
    expect(() => buildQmaiMenuSyncPayload(malformed)).toThrowError(
      expect.objectContaining({ code: "EMPTY_IDENTITY" }),
    );
  });

  it("does not substitute an undeclared item ID for the goods ID", () => {
    const malformed = structuredClone(menuResponse);
    const item = malformed.data.categoryItems[0].itemList[0] as {
      goodsId?: string;
      id?: string;
    };
    delete item.goodsId;
    item.id = "tempting-fallback";

    expect(() => buildQmaiMenuSyncPayload(malformed)).toThrowError(
      expect.objectContaining({ code: "EMPTY_IDENTITY" }),
    );
  });

  it("rejects malformed business responses", () => {
    expect(() =>
      buildQmaiMenuSyncPayload({ code: 10008, status: false, data: null }),
    ).toThrow("QMAI_MENU_ERROR");
  });
});
