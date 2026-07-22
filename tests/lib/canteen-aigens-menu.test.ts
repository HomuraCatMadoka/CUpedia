import { describe, expect, it } from "vitest";
import { buildShhoMenuSyncPayload } from "@/lib/canteen-aigens-menu";

describe("S.H. Ho Aigens menu adapter", () => {
  it("keeps primary products, maps periods, and excludes packaging categories", () => {
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
            { name: "外賣包裝", groupIds: ["pack"] },
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
            {
              id: "pack",
              items: [{ backendId: "45", name: "膠袋", price: 1 }],
            },
          ],
        },
      },
    });

    expect(payload).toMatchObject({
      source: "aigens:102830",
      takeOverLegacyItems: true,
    });
    expect(payload.items.map((item) => item.externalKey)).toEqual([
      "44:breakfast",
      "44:lunch",
      "42:lunch",
      "42:dinner",
    ]);
    expect(payload.items[0]).toMatchObject({
      name: "可樂",
      svgKey: "drink",
      priceOptions: [{ amountMinor: 1100 }],
    });
    expect(payload.items[2]).toMatchObject({
      name: "麻辣 雞飯",
      svgKey: "rice",
      priceOptions: [{ amountMinor: 3800 }],
    });
  });

  it("defaults categories without meal periods to lunch and dinner", () => {
    const payload = buildShhoMenuSyncPayload({
      data: {
        menu: {
          categories: [{ name: "飲品", groupIds: ["drinks"] }],
          groups: [
            {
              id: "drinks",
              items: [{ backendId: "44", name: "紅牛", price: 18 }],
            },
          ],
        },
      },
    });

    expect(payload.items.map((item) => item.externalKey)).toEqual([
      "44:lunch",
      "44:dinner",
    ]);
    expect(payload.items.every((item) => item.svgKey === "drink")).toBe(true);
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

  it("matches dish icons by complete keywords", () => {
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
    expect(payload.items[0].svgKey).toBe("default");
  });
});
