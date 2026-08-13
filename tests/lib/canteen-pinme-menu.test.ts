import { describe, expect, it } from "vitest";
import {
  buildPinmeMenuSyncPayload,
  createPinmeSignedParams,
} from "@/lib/canteen-pinme-menu";
import { fetchPinmeMenu } from "@/lib/canteen-menu-source-adapters";
import { vi } from "vitest";

describe("PINME menu adapter", () => {
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
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        group: [
          {
            local_name: "粉麵",
            start_time: "11:00",
            end_time: "20:00",
            products: [
              {
                product_id: "425657",
                status: "1",
                local_name: "喇沙魚旦烏冬",
                prices: [
                  {
                    status: "1",
                    takeout_price: "46.0000",
                    productStandardItem: { local_name: "標準" },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              group: [
                {
                  local_name: "飯類",
                  products: [
                    {
                      product_id: "1",
                      status: "1",
                      local_name: "叉燒飯",
                      price: "38.0000",
                    },
                  ],
                },
              ],
            },
          }),
        ),
      );

    const payload = await fetchPinmeMenu("5500", { fetchImpl });
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
