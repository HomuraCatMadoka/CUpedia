import { describe, expect, it } from "vitest";
import {
  buildPinmeMenuSyncPayload,
  createPinmeSignedParams,
} from "@/lib/canteen-pinme-menu";
import {
  fetchMenuFromProvider,
  fetchPinmeMenu,
} from "@/lib/canteen-menu-source-adapters";
import { vi } from "vitest";
import pinmeCurrent from "./fixtures/canteen-providers/pinme-current.json";

function pinmePayload(groups: Array<Record<string, unknown>>) {
  const identifiedGroups = groups.map((group, index) => ({
    ...group,
    group_id: String(index + 1),
  }));
  return {
    code: 200,
    data: {
      menu_group: [{ groups: identifiedGroups.map((group) => group.group_id) }],
      group: identifiedGroups,
    },
  };
}

describe("PINME menu adapter", () => {
  it("normalizes only groups referenced by the published menu topology", () => {
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        menu_group: [{ groups: ["101"] }],
        group: [
          {
            group_id: "101",
            local_name: "目前供應",
            products: [
              {
                product_id: "visible",
                status: "1",
                local_name: "目前菜品",
                price: 10,
              },
            ],
          },
          {
            group_id: "999",
            local_name: "未發布目錄",
            products: [
              {
                product_id: "hidden",
                status: "1",
                local_name: "不應同步",
                price: 20,
              },
            ],
          },
        ],
      },
    });

    expect(result.items.map((item) => item.externalProductId)).toEqual([
      "visible",
    ]);
  });

  it("handles repeated group references idempotently", () => {
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        menu_group: [{ groups: ["101", "101"] }, { groups: [101] }],
        group: [
          {
            group_id: 101,
            start_time: "07:00",
            end_time: "11:00",
            products: [
              { product_id: "42", local_name: "早餐", status: "1", price: 10 },
            ],
          },
          { group_id: "999", products: null },
        ],
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.scopeEvidence).toEqual({
      provider: "pinme",
      menuGroupCount: 2,
      groupCount: 2,
      referencedGroupIds: ["101"],
      publicationKey: expect.stringMatching(/^[a-f0-9]{24}$/),
      publicationCompatibilityKey: expect.stringMatching(/^[a-f0-9]{24}$/),
      publicationWindows: [],
      refreshBoundaryMinutes: [7 * 60, 11 * 60],
      serviceWindows: [{ startTime: "07:00", endTime: "11:00" }],
    });
  });

  it("keeps publication identity stable across equivalent duplicate topology", () => {
    const single = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        menu_group: [{ groups: ["101"] }],
        group: [
          {
            group_id: "101",
            products: [{ product_id: "42", local_name: "早餐", price: 10 }],
          },
        ],
      },
    });
    const repeated = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        menu_group: [{ groups: ["101", "101"] }, { groups: [101] }],
        group: [
          {
            group_id: 101,
            products: [{ product_id: "42", local_name: "早餐", price: 10 }],
          },
        ],
      },
    });

    if (
      single.scopeEvidence?.provider !== "pinme" ||
      repeated.scopeEvidence?.provider !== "pinme"
    ) {
      throw new Error("expected PINME evidence");
    }
    expect(repeated.scopeEvidence.publicationKey).toBe(
      single.scopeEvidence.publicationKey,
    );
    expect(repeated.scopeEvidence.publicationCompatibilityKey).toBe(
      single.scopeEvidence.publicationCompatibilityKey,
    );
  });

  it("fails closed when a published group reference is missing", () => {
    expect(() =>
      buildPinmeMenuSyncPayload({
        code: 200,
        data: {
          menu_group: [{ groups: ["404"] }],
          group: [{ group_id: "101", products: [] }],
        },
      }),
    ).toThrow("INVALID_PINME_MENU_TOPOLOGY");
  });

  it("bounds provider group references", () => {
    expect(() =>
      buildPinmeMenuSyncPayload({
        code: 200,
        data: {
          menu_group: [{ groups: Array.from({ length: 501 }, () => "101") }],
          group: [{ group_id: "101", products: [] }],
        },
      }),
    ).toThrow("INVALID_PINME_MENU_TOPOLOGY");
  });

  it("fails closed when the broad group pool has duplicate identities", () => {
    expect(() =>
      buildPinmeMenuSyncPayload({
        code: 200,
        data: {
          menu_group: [{ groups: ["101"] }],
          group: [
            { group_id: "101", products: [] },
            { group_id: 101, products: [] },
          ],
        },
      }),
    ).toThrow("INVALID_PINME_MENU_TOPOLOGY");
  });

  it.each([
    { label: "missing menu_group", menuGroup: undefined },
    { label: "non-array menu_group", menuGroup: {} },
    { label: "malformed menu group", menuGroup: [{}] },
    { label: "malformed group reference", menuGroup: [{ groups: ["bad"] }] },
  ])("fails closed for $label", ({ menuGroup }) => {
    expect(() =>
      buildPinmeMenuSyncPayload({
        code: 200,
        data: {
          menu_group: menuGroup,
          group: [{ group_id: "101", products: [] }],
        },
      }),
    ).toThrow("INVALID_PINME_MENU_TOPOLOGY");
  });

  it.each([
    { label: "no menu groups", menuGroup: [] },
    { label: "no selected groups", menuGroup: [{ groups: [] }] },
  ])("reports a valid empty menu for $label", ({ menuGroup }) => {
    expect(() =>
      buildPinmeMenuSyncPayload({
        code: 200,
        data: { menu_group: menuGroup, group: [] },
      }),
    ).toThrow("EMPTY_PINME_MENU");
  });

  it("keeps upstream-authored duplicates with distinct product IDs", () => {
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        menu_group: [{ groups: ["101", "102"] }],
        group: [
          {
            group_id: "101",
            local_name: "早餐 A",
            products: [{ product_id: "5001", local_name: "奶茶", price: 12 }],
          },
          {
            group_id: "102",
            local_name: "早餐 B",
            products: [{ product_id: "5002", local_name: "奶茶", price: 12 }],
          },
        ],
      },
    });

    expect(result.items.map((item) => item.externalProductId).sort()).toEqual([
      "5001",
      "5002",
    ]);
  });

  it("fails closed when the same product repeats in one meal-period group", () => {
    const product = {
      product_id: "42",
      status: "1",
      local_name: "菜品 A",
      price: 10,
    };
    expect(() =>
      buildPinmeMenuSyncPayload(
        pinmePayload([{ local_name: "A", products: [product, product] }]),
      ),
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
    const result = buildPinmeMenuSyncPayload(pinmePayload(groups));
    const reversed = buildPinmeMenuSyncPayload(
      pinmePayload(groups.toReversed()),
    );

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
    const result = buildPinmeMenuSyncPayload(
      pinmePayload([
        { local_name: "B", products: [{ ...product, prices }] },
        {
          local_name: "A",
          products: [{ ...product, prices: prices.toReversed() }],
        },
      ]),
    );

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
    const result = buildPinmeMenuSyncPayload(
      pinmePayload([
        { local_name: "全天", products: [product] },
        {
          local_name: "午餐",
          start_time: "11:00",
          end_time: "14:00",
          products: [product],
        },
      ]),
    );

    expect(result.items[0].mealPeriods).toEqual(["allday"]);
  });

  it("records deterministic provider service windows", () => {
    const product = {
      product_id: "42",
      status: "1",
      local_name: "菜品 A",
      price: 10,
    };
    const groups = [
      {
        local_name: "晚餐",
        start_time: "17:00",
        end_time: "21:00",
        products: [product],
      },
      {
        local_name: "午餐",
        start_time: "11:00",
        end_time: "14:00",
        products: [{ ...product, product_id: "43" }],
      },
    ];

    const result = buildPinmeMenuSyncPayload(pinmePayload(groups.toReversed()));

    expect(result.scopeEvidence).toEqual({
      provider: "pinme",
      menuGroupCount: 1,
      groupCount: 2,
      referencedGroupIds: ["1", "2"],
      publicationKey: expect.stringMatching(/^[a-f0-9]{24}$/),
      publicationCompatibilityKey: expect.stringMatching(/^[a-f0-9]{24}$/),
      publicationWindows: [],
      refreshBoundaryMinutes: [11 * 60, 14 * 60, 17 * 60, 21 * 60],
      refreshUntilMinute: 21 * 60,
      serviceWindows: [
        { startTime: "11:00", endTime: "14:00" },
        { startTime: "17:00", endTime: "21:00" },
      ],
    });
  });

  it("retains current publication windows and bounded refresh boundaries", () => {
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        menu_group: [
          {
            menu_id: "5150",
            start_time: "11:00",
            end_time: "14:30",
            groups: ["101"],
          },
        ],
        group: [
          {
            group_id: "101",
            local_name: "午餐",
            start_time: "11:00",
            end_time: "14:30",
            products: [
              { product_id: "noon", local_name: "午餐菜品", price: 30 },
            ],
          },
          {
            group_id: "102",
            local_name: "下午茶候选",
            start_time: "14:30",
            end_time: "17:00",
            products: [
              { product_id: "tea", local_name: "下午茶菜品", price: 20 },
            ],
          },
        ],
      },
    });

    expect(result.items.map((item) => item.externalProductId)).toEqual([
      "noon",
    ]);
    expect(result.scopeEvidence).toEqual({
      provider: "pinme",
      menuGroupCount: 1,
      groupCount: 2,
      referencedGroupIds: ["101"],
      serviceWindows: [{ startTime: "11:00", endTime: "14:30" }],
      publicationKey: expect.stringMatching(/^[a-f0-9]{24}$/),
      publicationCompatibilityKey: expect.stringMatching(/^[a-f0-9]{24}$/),
      publicationWindows: [
        { publicationId: "5150", startTime: "11:00", endTime: "14:30" },
      ],
      refreshBoundaryMinutes: [11 * 60, 14 * 60 + 30, 17 * 60],
      refreshUntilMinute: 17 * 60,
    });
  });

  it("derives the refresh horizon from the broad group pool, not the publication wrapper", () => {
    const result = buildPinmeMenuSyncPayload({
      code: 200,
      data: {
        menu_group: [
          {
            menu_id: "5150",
            start_time: "17:00",
            end_time: "20:30",
            groups: ["101"],
          },
        ],
        group: [
          {
            group_id: "101",
            start_time: "17:00",
            end_time: "19:45",
            products: [
              { product_id: "dinner", local_name: "晚餐菜品", price: 30 },
            ],
          },
          {
            group_id: "102",
            start_time: "17:00",
            end_time: "20:00",
            products: [],
          },
        ],
      },
    });

    expect(result.scopeEvidence).toMatchObject({
      provider: "pinme",
      refreshUntilMinute: 20 * 60,
      refreshBoundaryMinutes: [17 * 60, 19 * 60 + 45, 20 * 60, 20 * 60 + 30],
    });
  });

  it.each([
    { label: "missing", group: { start_time: "17:00" } },
    { label: "malformed", group: { start_time: "17:00", end_time: "later" } },
    {
      label: "cross-midnight",
      group: { start_time: "22:00", end_time: "02:00" },
    },
  ])(
    "omits an ambiguous refresh horizon for $label group-pool evidence",
    ({ group }) => {
      const result = buildPinmeMenuSyncPayload({
        code: 200,
        data: {
          menu_group: [{ groups: ["101"] }],
          group: [
            {
              group_id: "101",
              ...group,
              products: [
                { product_id: "dinner", local_name: "晚餐菜品", price: 30 },
              ],
            },
          ],
        },
      });

      expect(result.scopeEvidence).not.toHaveProperty("refreshUntilMinute");
    },
  );

  it("fails closed when two rows publish the same product identity", () => {
    const duplicate = pinmePayload([
      {
        local_name: "A",
        products: [{ product_id: "42", local_name: "菜品 A", price: 10 }],
      },
      {
        local_name: "B",
        products: [{ product_id: "42", local_name: "菜品 B", price: 20 }],
      },
    ]);
    expect(() => buildPinmeMenuSyncPayload(duplicate)).toThrowError(
      expect.objectContaining({ code: "COLLIDING_IDENTITY" }),
    );
  });

  it("fails closed when repeated product categories disagree on price", () => {
    expect(() =>
      buildPinmeMenuSyncPayload(
        pinmePayload([
          {
            local_name: "A",
            products: [{ product_id: "42", local_name: "菜品 A", price: 10 }],
          },
          {
            local_name: "B",
            products: [{ product_id: "42", local_name: "菜品 A", price: 20 }],
          },
        ]),
      ),
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
      buildPinmeMenuSyncPayload(
        pinmePayload([
          { products: [{ local_name: "不能當 ID", status: "1", price: 10 }] },
        ]),
      ),
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
    const result = buildPinmeMenuSyncPayload(
      pinmePayload([
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
      ]),
    );

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

  it("scopes recurring observations to the scheduler meal period", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, data: { token: "temporary" } }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(pinmeCurrent)));

    await expect(
      fetchMenuFromProvider(
        { provider: "pinme", externalStoreId: "5500" },
        {
          observedAt: new Date("2026-08-24T09:17:00Z"),
          syncWindowKey: "2026-08-24/dinner",
          mealPeriod: "dinner",
        },
        { fetchImpl },
      ),
    ).resolves.toMatchObject({
      snapshotCompleteness: "partial",
      observationScope: { kind: "meal-period", mealPeriod: "dinner" },
    });
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
            data: {
              menu_group: [{ groups: ["1"] }],
              group: [{ group_id: "1", local_name: "飯類", products: null }],
            },
          }),
        ),
      );

    await expect(fetchPinmeMenu("5500", { fetchImpl })).rejects.toThrow(
      "INVALID_PINME_MENU",
    );
  });
});
