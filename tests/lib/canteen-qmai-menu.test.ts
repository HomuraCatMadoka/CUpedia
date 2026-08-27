import { describe, expect, it, vi } from "vitest";
import { fetchQmaiMenu } from "@/lib/canteen-menu-source-adapters";
import { buildQmaiMenuSyncPayload } from "@/lib/canteen-qmai-menu";
import qmaiCurrent from "./fixtures/canteen-providers/qmai-current.json";

const menuResponse = qmaiCurrent;

function pointInTimeMenu(itemCount: number) {
  const response = structuredClone(menuResponse);
  const template = response.data.categoryItems[0].itemList[0];
  response.data.categoryItems[0].itemList = Array.from(
    { length: itemCount },
    (_, index) => ({
      ...structuredClone(template),
      goodsId: `goods-${index + 1}`,
      name: `菜品 ${index + 1}`,
      saleTime: undefined,
    }),
  );
  return response;
}

describe("Qmai menu adapter", () => {
  it("fails closed when the same goods ID repeats in one sale period", () => {
    const duplicateResponse = structuredClone(menuResponse);
    const item = duplicateResponse.data.categoryItems[0].itemList[0];
    duplicateResponse.data.categoryItems[0].itemList.unshift(
      structuredClone(item),
    );
    expect(() =>
      buildQmaiMenuSyncPayload(duplicateResponse, "lunch"),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTITY" }));
  });

  it("merges the same goods ID across disjoint sale periods", () => {
    const repeatedResponse = structuredClone(menuResponse);
    const dinnerItem = structuredClone(
      repeatedResponse.data.categoryItems[0].itemList[0],
    );
    dinnerItem.saleTime = {
      dateStart: "",
      dateEnd: "",
      weekTimeList: [
        {
          weekdayList: [1, 2, 3, 4, 5, 6, 7],
          timeList: [{ timeStart: "17:00", timeEnd: "20:00" }],
          weekDesc: "周一至周日",
        },
      ],
    };
    repeatedResponse.data.categoryItems[0].itemList.push(dinnerItem);

    expect(
      buildQmaiMenuSyncPayload(repeatedResponse, "lunch").items[0],
    ).toMatchObject({
      externalProductId: "goods-1",
      mealPeriods: ["lunch", "dinner"],
    });
  });

  it("retains compatible category occurrences and their own prices", () => {
    const repeatedResponse = structuredClone(menuResponse);
    const second = structuredClone(
      repeatedResponse.data.categoryItems[0].itemList[0],
    );
    second.skuList = [
      {
        skuId: "category-price",
        salePrice: 42,
        skuItemList: [{ itemName: "分類價" }],
      },
    ];
    repeatedResponse.data.categoryItems.push({
      available: 1,
      categoryName: "另一分類",
      itemList: [second],
    });

    const [item] = buildQmaiMenuSyncPayload(repeatedResponse, "lunch").items;
    expect(item.occurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryKey: "另一分類",
          priceOptions: [expect.objectContaining({ amountMinor: 4200 })],
        }),
      ]),
    );
    expect(item.occurrences).toHaveLength(2);
    expect(item.priceOptions.map((option) => option.amountMinor)).toContain(
      4200,
    );
  });

  it("normalizes available products, variants, and sale windows", () => {
    const result = buildQmaiMenuSyncPayload(menuResponse, "lunch");

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

  it("keeps an explicit lunch window out of the observed dinner period", () => {
    expect(
      buildQmaiMenuSyncPayload(menuResponse, "dinner").items[0],
    ).toMatchObject({
      externalProductId: "goods-1",
      mealPeriods: ["lunch"],
    });
  });

  it("retains direct sale-window aliases for compatibility", () => {
    const response = structuredClone(menuResponse);
    const item = response.data.categoryItems[0].itemList[0] as unknown as {
      saleTime: unknown;
    };
    item.saleTime = {
      weekTimeList: [{ startTime: "11:00", endTime: "14:30" }],
    };

    expect(buildQmaiMenuSyncPayload(response, "dinner").items[0]).toMatchObject(
      {
        externalProductId: "goods-1",
        mealPeriods: ["lunch"],
      },
    );
  });

  it("fails closed when a declared sale schedule cannot be parsed", () => {
    const malformed = structuredClone(menuResponse) as unknown as {
      data: {
        categoryItems: Array<{
          itemList: Array<{ saleTime: { weekTimeList: unknown[] } }>;
        }>;
      };
    };
    malformed.data.categoryItems[0].itemList[0].saleTime.weekTimeList = [
      { timeList: [{ opensAt: "11:00", closesAt: "14:30" }] },
    ];

    expect(() => buildQmaiMenuSyncPayload(malformed, "dinner")).toThrow(
      "INVALID_QMAI_SALE_TIME",
    );
  });

  it.each([
    ["a scalar", "11:00-14:30"],
    ["an array", [{ timeStart: "11:00", timeEnd: "14:30" }]],
    ["an object with unknown schedule keys", { periods: ["11:00-14:30"] }],
  ])("fails closed when saleTime is %s", (_description, saleTime) => {
    const malformed = structuredClone(menuResponse);
    const item = malformed.data.categoryItems[0].itemList[0] as unknown as {
      saleTime: unknown;
    };
    item.saleTime = saleTime;

    expect(() => buildQmaiMenuSyncPayload(malformed, "dinner")).toThrow(
      "INVALID_QMAI_SALE_TIME",
    );
  });

  it("fails closed when a declared sale interval is invalid", () => {
    const malformed = structuredClone(menuResponse);
    const interval = malformed.data.categoryItems[0]?.itemList[0]?.saleTime
      ?.weekTimeList[0]?.timeList[0] as { timeStart: string } | undefined;
    expect(interval).toBeDefined();
    if (!interval) throw new Error("QMAI_FIXTURE_MISSING_SALE_INTERVAL");
    interval.timeStart = "25:00";

    expect(() => buildQmaiMenuSyncPayload(malformed, "dinner")).toThrow(
      "INVALID_QMAI_SALE_TIME",
    );
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
      {
        fetchImpl,
        observationContext: {
          observedAt: new Date("2026-08-24T04:00:00.000Z"),
          syncWindowKey: "2026-08-24/lunch",
          mealPeriod: "lunch",
        },
      },
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
    expect(JSON.parse(String(menuInit?.body)).buyTime).toBe(
      "2026-08-24 12:00:00",
    );
  });

  it("scopes products without declared sale windows to the observed period", async () => {
    const pointInTimeResponse = structuredClone(menuResponse);
    const pointInTimeItem = pointInTimeResponse.data.categoryItems[0]
      .itemList[0] as unknown as { saleTime: unknown };
    pointInTimeItem.saleTime = {
      dateStart: "",
      dateEnd: "",
      weekTimeList: null,
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 0, status: true, data: { token: "visitor" } }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(pointInTimeResponse)));

    const result = await fetchQmaiMenu(
      "331725",
      {
        fetchImpl,
        observationContext: {
          observedAt: new Date("2026-08-24T10:00:00.000Z"),
          syncWindowKey: "2026-08-24/dinner",
          mealPeriod: "dinner",
        },
      },
      { orderType: 1, locale: "zh-HK" },
      "221033",
    );

    expect(result).toMatchObject({
      observationScope: { kind: "meal-period", mealPeriod: "dinner" },
      items: [expect.objectContaining({ mealPeriods: ["dinner"] })],
    });
  });

  it.each([
    ["breakfast", 5],
    ["lunch", 28],
    ["dinner", 5],
  ] as const)(
    "retains a %s point-in-time response as that period's complete scope",
    (mealPeriod, itemCount) => {
      const result = buildQmaiMenuSyncPayload(
        pointInTimeMenu(itemCount),
        mealPeriod,
      );

      expect(result.items).toHaveLength(itemCount);
      expect(result.observationScope).toEqual({
        kind: "meal-period",
        mealPeriod,
      });
      expect(
        result.items.every(
          (item) =>
            item.mealPeriods.length === 1 && item.mealPeriods[0] === mealPeriod,
        ),
      ).toBe(true);
    },
  );

  it("reuses the claimed observation timestamp when the menu request retries", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 0, status: true, data: { token: "visitor" } }),
        ),
      )
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(menuResponse)));

    await fetchQmaiMenu(
      "331725",
      {
        fetchImpl,
        observationContext: {
          observedAt: new Date("2026-08-24T09:17:00.000Z"),
          syncWindowKey: "2026-08-24/dinner",
          mealPeriod: "dinner",
        },
      },
      { orderType: 1, locale: "zh-HK" },
      "221033",
    );

    const requestBodies = fetchImpl.mock.calls
      .slice(1)
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0].buyTime).toBe("2026-08-24 17:17:00");
    expect(requestBodies[1]).toEqual(requestBodies[0]);
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

    expect(buildQmaiMenuSyncPayload(duplicateResponse, "lunch").items).toEqual([
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
    expect(() =>
      buildQmaiMenuSyncPayload(duplicateResponse, "lunch"),
    ).toThrowError(expect.objectContaining({ code: "COLLIDING_IDENTITY" }));
  });

  it("fails closed when an available item ID is empty", () => {
    const malformed = structuredClone(menuResponse);
    malformed.data.categoryItems[0].itemList[0].goodsId = "";
    expect(() => buildQmaiMenuSyncPayload(malformed, "lunch")).toThrowError(
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

    expect(() => buildQmaiMenuSyncPayload(malformed, "lunch")).toThrowError(
      expect.objectContaining({ code: "EMPTY_IDENTITY" }),
    );
  });

  it("rejects malformed business responses", () => {
    expect(() =>
      buildQmaiMenuSyncPayload(
        { code: 10008, status: false, data: null },
        "lunch",
      ),
    ).toThrow("QMAI_MENU_ERROR");
  });
});
