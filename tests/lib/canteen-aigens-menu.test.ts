import { describe, expect, it } from "vitest";
import { buildShhoMenuSyncPayload } from "@/lib/canteen-aigens-menu";

describe("S.H. Ho Aigens menu adapter", () => {
  it("keeps primary products, maps periods, and excludes generic categories", () => {
    const payload = buildShhoMenuSyncPayload({
      data: {
        menu: {
          categories: [
            {
              name: "飯類",
              periods: ["L", "T", "D"],
              groupIds: ["main", "add"],
            },
            { name: "飲品", periods: ["B", "L"], groupIds: ["drinks"] },
          ],
          groups: [
            {
              id: "main",
              items: [
                {
                  backendId: "42",
                  name: " 麻辣 雞飯 ",
                  price: 38,
                  published: true,
                },
              ],
            },
            {
              id: "add",
              items: [{ backendId: "43", name: "+凍奶茶", price: 4 }],
            },
            {
              id: "drinks",
              items: [{ backendId: "44", name: "可樂", price: 11 }],
            },
          ],
        },
      },
    });

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
});
