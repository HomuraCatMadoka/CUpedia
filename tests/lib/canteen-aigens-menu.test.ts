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

    expect(payload.takeOverLegacyItems).toBe(false);
    expect(payload.items).toHaveLength(2);
    expect(payload.items.map((item) => item.externalProductId).sort()).toEqual([
      "42#offering-period=dinner",
      "42#offering-period=lunch",
    ]);
    expect(payload.items[0]).toMatchObject({
      name: "麻辣 雞飯",
      svgKey: "飯類",
      priceOptions: [{ amountMinor: 3800 }],
    });
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

    expect(payload.items).toHaveLength(2);
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalProductId: "1100031695#offering-period=lunch",
          name: "脆腩紅燒豆腐飯",
          priceOptions: [
            expect.objectContaining({ label: null, amountMinor: 4700 }),
          ],
        }),
        expect.objectContaining({
          externalProductId: "1100031695#offering-period=dinner",
        }),
      ]),
    );
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
          externalProductId: "1100075927#offering-period=lunch",
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

  it("normalizes the sanitized provider response through the fetch adapter", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify(aigensCurrent), { status: 200 });

    await expect(
      fetchAigensMenu("102830", { fetchImpl }),
    ).resolves.toMatchObject({
      items: [
        { externalProductId: "42#offering-period=lunch" },
        { externalProductId: "42#offering-period=dinner" },
      ],
    });
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
        externalProductId: "42#offering-period=allday",
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
