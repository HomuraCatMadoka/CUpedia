import { describe, expect, it } from "vitest";
import {
  buildPinmeMenuSyncPayload,
  createPinmeSignedParams,
} from "@/lib/canteen-pinme-menu";
import { fetchPinmeMenu } from "@/lib/canteen-menu-source-adapters";
import { vi } from "vitest";
import pinmeCurrent from "./fixtures/canteen-providers/pinme-current.json";

describe("PINME menu adapter", () => {
  it("fails closed when the same product repeats in one meal-period group", () => {
    const product = {
      product_id: "42",
      status: "1",
      local_name: "菜品 A",
      price: 10,
    };
    expect(() =>
      buildPinmeMenuSyncPayload({
        code: 200,
        data: {
          group: [{ local_name: "A", products: [product, product] }],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTITY" }));
  });

  it.each([
    {
      storeShape: "4899 recommendation and ordinary categories",
      productId: "313090",
      name: "椰乳 · 咖啡",
      price: 33,
      firstCategory: "｜新上架",
      secondCategory: "｜咖啡",
      firstWindow: ["10:55", "19:30"],
      secondWindow: ["10:55", "20:00"],
      expectedPeriods: ["breakfast", "lunch", "dinner"],
    },
    {
      storeShape: "5500 breakfast and recommendation categories",
      productId: "550042",
      name: "沙嗲牛肉麵",
      price: 26,
      firstCategory: "早餐專用",
      secondCategory: "推介",
      firstWindow: ["07:30", "11:00"],
      secondWindow: ["07:30", "14:30"],
      expectedPeriods: ["breakfast", "lunch"],
    },
  ])("coalesces repeated products for $storeShape", (fixture) => {
    const product = {
      product_id: fixture.productId,
      status: "1",
      local_name: fixture.name,
      price: fixture.price,
    };
    const groups = [
      {
        local_name: fixture.firstCategory,
        start_time: fixture.firstWindow[0],
        end_time: fixture.firstWindow[1],
        products: [product],
      },
      {
        local_name: fixture.secondCategory,
        start_time: fixture.secondWindow[0],
        end_time: fixture.secondWindow[1],
        products: [product],
      },
    ];
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: { group: groups },
    });
    const reversed = buildPinmeMenuSyncPayload({
      code: 200,
      data: { group: groups.toReversed() },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      externalProductId: fixture.productId,
      name: fixture.name,
      priceOptions: [
        {
          label: null,
          amountMinor: fixture.price * 100,
          currency: "HKD",
          sortOrder: 0,
        },
      ],
      mealPeriods: fixture.expectedPeriods,
      svgKey: [fixture.firstCategory, fixture.secondCategory].sort()[0],
    });
    expect(reversed).toEqual(result);
  });

  it("coalesces semantically equal price options in either provider order", () => {
    const prices = [
      {
        status: "1",
        takeout_price: "20.0000",
        productStandardItem: { local_name: "小" },
      },
      {
        status: "1",
        takeout_price: "30.0000",
        productStandardItem: { local_name: "大" },
      },
    ];
    const product = {
      product_id: "42",
      status: "1",
      local_name: "菜品 A",
    };
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        group: [
          { local_name: "B", products: [{ ...product, prices }] },
          {
            local_name: "A",
            products: [{ ...product, prices: prices.toReversed() }],
          },
        ],
      },
    });

    expect(result.items).toMatchObject([
      {
        externalProductId: "42",
        svgKey: "A",
        priceOptions: [
          { label: "大", amountMinor: 3000, sortOrder: 0 },
          { label: "小", amountMinor: 2000, sortOrder: 1 },
        ],
      },
    ]);
  });

  it("normalizes all-day and specific occurrences to all-day", () => {
    const product = {
      product_id: "42",
      status: "1",
      local_name: "菜品 A",
      price: 10,
    };
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        group: [
          { local_name: "全天", products: [product] },
          {
            local_name: "午餐",
            start_time: "11:00",
            end_time: "14:00",
            products: [product],
          },
        ],
      },
    });

    expect(result.items[0].mealPeriods).toEqual(["allday"]);
  });

  it("fails closed when two rows publish the same product identity", () => {
    const duplicate = {
      code: 200,
      data: {
        group: [
          {
            local_name: "A",
            products: [{ product_id: "42", local_name: "菜品 A", price: 10 }],
          },
          {
            local_name: "B",
            products: [{ product_id: "42", local_name: "菜品 B", price: 20 }],
          },
        ],
      },
    };
    expect(() => buildPinmeMenuSyncPayload(duplicate)).toThrowError(
      expect.objectContaining({ code: "COLLIDING_IDENTITY" }),
    );
  });

  it("fails closed when repeated product categories disagree on price", () => {
    expect(() =>
      buildPinmeMenuSyncPayload({
        code: 200,
        data: {
          group: [
            {
              local_name: "A",
              products: [{ product_id: "42", local_name: "菜品 A", price: 10 }],
            },
            {
              local_name: "B",
              products: [{ product_id: "42", local_name: "菜品 A", price: 20 }],
            },
          ],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "COLLIDING_IDENTITY" }));
  });
  it("creates deterministic signed anonymous token params", () => {
    expect(Object.fromEntries(createPinmeSignedParams("5500", 123))).toEqual({
      store_id: "5500",
      ts: "123",
      sign: "2602177AEB330578D1AB75735A3CFBBC",
    });
  });

  it("fails closed instead of using a product name when ID is missing", () => {
    expect(() =>
      buildPinmeMenuSyncPayload({
        code: 200,
        data: {
          group: [
            { products: [{ local_name: "不能當 ID", status: "1", price: 10 }] },
          ],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "EMPTY_IDENTITY" }));
  });

  it("normalizes groups, products and price variants", () => {
    const result = buildPinmeMenuSyncPayload(pinmeCurrent);
    expect(result.items).toEqual([
      expect.objectContaining({
        externalProductId: "425657",
        name: "喇沙魚旦烏冬",
        mealPeriods: ["lunch", "dinner"],
        priceOptions: [
          { label: null, amountMinor: 4600, currency: "HKD", sortOrder: 0 },
        ],
      }),
    ]);
  });

  it("merges products repeated across menu groups by external identity", () => {
    const product = {
      product_id: "318774",
      status: "1",
      local_name: "小種鮮奶茶",
      price: "18.0000",
    };
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        group: [
          {
            local_name: "飲品",
            start_time: "07:00",
            end_time: "11:00",
            products: [product],
          },
          {
            local_name: "飲品",
            start_time: "14:00",
            end_time: "18:00",
            products: [product],
          },
        ],
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        externalProductId: "318774",
        mealPeriods: ["breakfast", "lunch", "dinner"],
      }),
    );
  });

  it("keeps the anonymous token inside the two-request adapter", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, data: { token: "temporary" } }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(pinmeCurrent)));

    const payload = await fetchPinmeMenu("5500", { fetchImpl });
    expect(payload.snapshotCompleteness).toBe("partial");
    expect(payload.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/api/account/token?");
    expect(String(fetchImpl.mock.calls[1][0])).toContain(
      "/api/home/product-menus?",
    );
    expect(
      new Headers(fetchImpl.mock.calls[1][1]?.headers).get("Authorization"),
    ).toBe("Bearer temporary");
  });

  it("rejects malformed product collections before normalization", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, data: { token: "token" } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: { group: [{ local_name: "飯類", products: null }] },
          }),
        ),
      );

    await expect(fetchPinmeMenu("5500", { fetchImpl })).rejects.toThrow(
      "INVALID_PINME_MENU",
    );
  });
});
