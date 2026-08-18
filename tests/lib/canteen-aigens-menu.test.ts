import { describe, expect, it } from "vitest";
import { buildShhoMenuSyncPayload } from "@/lib/canteen-aigens-menu";
import { fetchAigensMenu } from "@/lib/canteen-menu-source-adapters";
import aigensCurrent from "./fixtures/canteen-providers/aigens-current.json";

describe("S.H. Ho Aigens menu adapter", () => {
  it("fails closed when the same offering repeats in one period", () => {
    const item = {
      backendId: "42",
      name: "菜品 A",
      price: 20,
      published: true,
    };
    expect(() =>
      buildShhoMenuSyncPayload({
        data: {
          menu: {
            categories: [{ name: "飯類", periods: ["L"], groupIds: ["main"] }],
            groups: [
              {
                id: "main",
                items: [item, { ...item, backendId: " 42 " }],
              },
            ],
          },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_IDENTITY" }));
  });

  it("keeps primary products, maps periods, and excludes generic categories", () => {
    const payload = buildShhoMenuSyncPayload(aigensCurrent);

    expect(payload.snapshotCompleteness).toBe("partial");
    expect(payload.takeOverLegacyItems).toBe(false);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      externalProductId: "42",
      mealPeriods: ["lunch", "dinner"],
    });
    expect(payload.items[0]).toMatchObject({
      name: "麻辣 雞飯",
      svgKey: "飯類",
      priceOptions: [{ amountMinor: 3800 }],
    });
  });

  it("collapses a 102830-shaped 102 occurrences into 76 backend products", () => {
    const lunchProducts = Array.from({ length: 76 }, (_, index) => ({
      backendId: `102830-product-${index + 1}`,
      name: `净化菜品 ${index + 1}`,
      price: 30 + (index % 10),
      published: true,
    }));
    const payload = buildShhoMenuSyncPayload({
      data: {
        menu: {
          categories: [
            { name: "午餐", periods: ["L"], groupIds: ["lunch"] },
            { name: "晚餐", periods: ["D"], groupIds: ["dinner"] },
          ],
          groups: [
            { id: "lunch", items: lunchProducts },
            { id: "dinner", items: lunchProducts.slice(0, 26) },
          ],
        },
      },
    });

    expect(lunchProducts.length + 26).toBe(102);
    expect(payload.items).toHaveLength(76);
    expect(
      new Set(payload.items.map((item) => item.externalProductId)).size,
    ).toBe(76);
    expect(
      payload.items.filter(
        (item) => item.mealPeriods.join(",") === "lunch,dinner",
      ),
    ).toHaveLength(26);
    expect(
      payload.items.filter((item) => item.mealPeriods.join(",") === "lunch"),
    ).toHaveLength(50);
  });

  it("coalesces category aliases that reference the same provider group", () => {
    const item = {
      backendId: "1100031695",
      name: "脆腩紅燒豆腐飯",
      price: 47,
      published: true,
    };
    const payload = buildShhoMenuSyncPayload({
      data: {
        menu: {
          categories: [
            {
              name: "脆腩紅燒豆腐飯",
              periods: ["L", "T", "D"],
              groupIds: ["shared"],
            },
            { name: "黯然銷魂飯", periods: ["L"], groupIds: ["shared"] },
          ],
          groups: [{ id: "shared", items: [item] }],
        },
      },
    });

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      externalProductId: "1100031695",
      name: "脆腩紅燒豆腐飯",
      mealPeriods: ["lunch", "dinner"],
      priceOptions: [
        expect.objectContaining({ label: null, amountMinor: 4700 }),
      ],
    });
  });

  it("preserves category-context prices under one stable offering identity", () => {
    const payload = buildShhoMenuSyncPayload({
      data: {
        menu: {
          categories: [
            { name: "泰式船麵", periods: ["L", "D"], groupIds: ["lunch"] },
            {
              name: "泰式船麵茶餐",
              periods: ["T"],
              groupIds: ["tea"],
            },
          ],
          groups: [
            {
              id: "lunch",
              items: [
                {
                  backendId: "1100075927",
                  name: "雞中翼 ‧ 豬肉丸船麵",
                  price: 48,
                },
              ],
            },
            {
              id: "tea",
              items: [
                {
                  backendId: "1100075927",
                  name: "雞中翼 ‧ 豬肉丸船麵",
                  price: 36,
                },
              ],
            },
          ],
        },
      },
    });

    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalProductId: "1100075927",
          mealPeriods: ["lunch", "dinner"],
          name: "雞中翼 ‧ 豬肉丸船麵",
          priceOptions: [
            {
              label: "泰式船麵",
              amountMinor: 4800,
              currency: "HKD",
              sortOrder: 0,
            },
            {
              label: "泰式船麵茶餐",
              amountMinor: 3600,
              currency: "HKD",
              sortOrder: 1,
            },
          ],
        }),
      ]),
    );
  });

  it("materializes coalesced categories independently of provider order", () => {
    const categories = [
      { name: "Z 套餐", periods: ["L"], groupIds: ["regular"] },
      { name: "A 茶餐", periods: ["T"], groupIds: ["tea"] },
    ];
    const groups = [
      {
        id: "regular",
        items: [{ backendId: "42", name: "菜品 A", price: 48 }],
      },
      {
        id: "tea",
        items: [{ backendId: "42", name: "菜品 A", price: 36 }],
      },
    ];
    const build = (orderedCategories: typeof categories) =>
      buildShhoMenuSyncPayload({
        data: { menu: { categories: orderedCategories, groups } },
      });

    expect(build(categories.toReversed())).toEqual(build(categories));
  });

  it("fails closed when one category context publishes two prices", () => {
    expect(() =>
      buildShhoMenuSyncPayload({
        data: {
          menu: {
            categories: [
              { name: "套餐", periods: ["L"], groupIds: ["regular"] },
              { name: "套餐", periods: ["T"], groupIds: ["tea"] },
            ],
            groups: [
              {
                id: "regular",
                items: [{ backendId: "42", name: "菜品 A", price: 48 }],
              },
              {
                id: "tea",
                items: [{ backendId: "42", name: "菜品 A", price: 36 }],
              },
            ],
          },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "COLLIDING_IDENTITY" }));
  });

  it("labels period-specific prices on one dish identity", () => {
    const payload = buildShhoMenuSyncPayload({
      data: {
        menu: {
          categories: [
            { name: "套餐", periods: ["L"], groupIds: ["lunch"] },
            { name: "套餐", periods: ["D"], groupIds: ["dinner"] },
          ],
          groups: [
            {
              id: "lunch",
              items: [{ backendId: "42", name: "菜品 A", price: 36 }],
            },
            {
              id: "dinner",
              items: [{ backendId: "42", name: "菜品 A", price: 48 }],
            },
          ],
        },
      },
    });

    expect(payload.items).toEqual([
      expect.objectContaining({
        externalProductId: "42",
        mealPeriods: ["lunch", "dinner"],
        priceOptions: [
          {
            label: "午餐 · 套餐",
            amountMinor: 3600,
            currency: "HKD",
            sortOrder: 0,
          },
          {
            label: "晚餐 · 套餐",
            amountMinor: 4800,
            currency: "HKD",
            sortOrder: 1,
          },
        ],
      }),
    ]);
  });

  it("normalizes the sanitized provider response through the fetch adapter", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify(aigensCurrent), { status: 200 });

    await expect(
      fetchAigensMenu("102830", { fetchImpl }),
    ).resolves.toMatchObject({
      snapshotCompleteness: "partial",
      scopeEvidence: {
        provider: "aigens",
        externalStoreId: "102830",
        storeName: "Sanitized Aigens store",
        menuName: "Sanitized full catalog",
        providerPeriodCodes: ["B", "D", "L", "T"],
        categoryPeriodCodes: ["B", "D", "L", "T"],
        categoryCount: 2,
        groupCount: 3,
      },
      items: [
        {
          externalProductId: "42",
          mealPeriods: ["lunch", "dinner"],
        },
      ],
    });
  });

  it("keeps a broad ordering observation partial across ordinary item changes", async () => {
    const expanded = structuredClone(aigensCurrent);
    expanded.data.menu.groups[0].items.push({
      backendId: "45",
      name: "新增菜品",
      price: 42,
      published: true,
    });
    const fetchImpl = async () =>
      new Response(JSON.stringify(expanded), { status: 200 });

    await expect(
      fetchAigensMenu("102830", { fetchImpl }),
    ).resolves.toMatchObject({
      snapshotCompleteness: "partial",
      items: [{ externalProductId: "42" }, { externalProductId: "45" }],
      scopeEvidence: {
        categoryPeriodCodes: ["B", "D", "L", "T"],
      },
    });
  });

  it("labels broad and contracted 102830-shaped service observations partial", async () => {
    const providerPeriodCodes = [
      "B",
      "D",
      "L",
      "M",
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "T",
    ];
    const categoryPeriods = ["B", "L", "T", "D", "S1"];
    const itemCounts = [20, 67, 20, 20, 27];
    let productNumber = 0;
    const groups = categoryPeriods.map((period, categoryIndex) => ({
      id: `period-${period}`,
      items: Array.from({ length: itemCounts[categoryIndex] }, () => {
        productNumber += 1;
        return {
          backendId: `102830-product-${productNumber}`,
          name: `菜品 ${productNumber}`,
          price: 30 + (productNumber % 10),
          published: true,
        };
      }),
    }));
    const broadServiceObservation = {
      ...structuredClone(aigensCurrent),
      data: {
        ...structuredClone(aigensCurrent.data),
        menu: {
          ...structuredClone(aigensCurrent.data.menu),
          periods: providerPeriodCodes.map((code) => ({ code })),
          categories: categoryPeriods.map((period) => ({
            name: `時段 ${period}`,
            periods: [period],
            groupIds: [`period-${period}`],
          })),
          groups,
        },
      },
    };
    const contractedServiceObservation = structuredClone(
      broadServiceObservation,
    );
    contractedServiceObservation.data.menu.categories = [
      broadServiceObservation.data.menu.categories[1],
    ];
    contractedServiceObservation.data.menu.groups = [
      broadServiceObservation.data.menu.groups[1],
    ];
    const broadPayload = await fetchAigensMenu("102830", {
      fetchImpl: async () =>
        new Response(JSON.stringify(broadServiceObservation), { status: 200 }),
    });

    const payload = await fetchAigensMenu("102830", {
      fetchImpl: async () =>
        new Response(JSON.stringify(contractedServiceObservation), {
          status: 200,
        }),
    });

    expect(broadPayload.items).toHaveLength(154);
    expect(broadPayload.snapshotCompleteness).toBe("partial");
    expect(payload.items).toHaveLength(67);
    expect(payload.scopeEvidence).toMatchObject({
      providerPeriodCodes: [
        "B",
        "D",
        "L",
        "M",
        "S1",
        "S2",
        "S3",
        "S4",
        "S5",
        "S6",
        "S7",
        "T",
      ],
      categoryPeriodCodes: ["L"],
      categoryCount: 1,
      groupCount: 1,
    });
    expect(payload.snapshotCompleteness).toBe("partial");
  });

  it("rejects a catalog whose store scope does not match the requested source", async () => {
    const mismatched = {
      ...aigensCurrent,
      data: {
        ...aigensCurrent.data,
        id: 112891,
        published: true,
        terminated: false,
        menu: {
          ...aigensCurrent.data.menu,
          archived: false,
          storeIds: [112891],
          periods: [{ code: "L" }, { code: "D" }],
        },
      },
    };
    const fetchImpl = async () =>
      new Response(JSON.stringify(mismatched), { status: 200 });

    await expect(fetchAigensMenu("102830", { fetchImpl })).rejects.toThrow(
      "INVALID_AIGENS_MENU_SCOPE",
    );
  });

  it("rejects unbounded catalog scope evidence", async () => {
    const unbounded = {
      ...aigensCurrent,
      data: { ...aigensCurrent.data, name: "x".repeat(201) },
    };
    const fetchImpl = async () =>
      new Response(JSON.stringify(unbounded), { status: 200 });

    await expect(fetchAigensMenu("102830", { fetchImpl })).rejects.toThrow(
      "INVALID_AIGENS_MENU_SCOPE",
    );
  });

  it("rejects the whole snapshot when a product price is missing", () => {
    expect(() =>
      buildShhoMenuSyncPayload({
        data: {
          menu: {
            categories: [{ name: "飯類", periods: ["L"], groupIds: ["main"] }],
            groups: [
              { id: "main", items: [{ backendId: "42", name: "演示菜品" }] },
            ],
          },
        },
      }),
    ).toThrow("INVALID_AIGENS_PRICE");
  });

  it("preserves store category as section key instead of name inference", () => {
    const payload = buildShhoMenuSyncPayload({
      data: {
        menu: {
          categories: [{ name: "小食", periods: ["L"], groupIds: ["main"] }],
          groups: [
            {
              id: "main",
              items: [{ backendId: "42", name: "薯仔沙律", price: 20 }],
            },
          ],
        },
      },
    });
    expect(payload.items[0].svgKey).toBe("小食");
  });

  it("defaults products without meal periods to all-day", () => {
    const payload = buildShhoMenuSyncPayload({
      data: {
        menu: {
          categories: [{ name: "飯類", groupIds: ["main"] }],
          groups: [
            {
              id: "main",
              items: [{ backendId: "42", name: "演示菜品", price: 20 }],
            },
          ],
        },
      },
    });

    expect(payload.items).toMatchObject([
      {
        externalProductId: "42",
        mealPeriods: ["allday"],
        svgKey: "飯類",
      },
    ]);
  });

  it("fails closed when duplicate offering identities disagree", () => {
    expect(() =>
      buildShhoMenuSyncPayload({
        data: {
          menu: {
            categories: [
              { name: "飯類", periods: ["L"], groupIds: ["main"] },
              { name: "小食", periods: ["L"], groupIds: ["other"] },
            ],
            groups: [
              {
                id: "main",
                items: [{ backendId: "42", name: "菜品 A", price: 20 }],
              },
              {
                id: "other",
                items: [{ backendId: "42", name: "菜品 B", price: 30 }],
              },
            ],
          },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "COLLIDING_IDENTITY" }));
  });

  it("fails closed when a published offering has no backend ID", () => {
    expect(() =>
      buildShhoMenuSyncPayload({
        data: {
          menu: {
            categories: [{ name: "飯類", periods: ["L"], groupIds: ["main"] }],
            groups: [{ id: "main", items: [{ name: "不能當 ID", price: 20 }] }],
          },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "EMPTY_IDENTITY" }));
  });

  it("does not substitute an undeclared item ID for the backend ID", () => {
    const malformed = structuredClone(aigensCurrent);
    const item = malformed.data.menu.groups[0].items[0] as {
      backendId?: string;
      id?: string;
    };
    delete item.backendId;
    item.id = "tempting-fallback";

    expect(() => buildShhoMenuSyncPayload(malformed)).toThrowError(
      expect.objectContaining({ code: "EMPTY_IDENTITY" }),
    );
  });
});
