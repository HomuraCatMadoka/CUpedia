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

    expect(payload).toMatchObject({
      source: "aigens:102830",
      takeOverLegacyItems: true,
    });
    expect(payload.items).toHaveLength(2);
    expect(payload.items.map((item) => item.externalKey)).toEqual([
      "42:lunch",
      "42:dinner",
    ]);
    expect(payload.items[0]).toMatchObject({
      name: "麻辣 雞飯",
      svgKey: "spicy",
      priceOptions: [{ amountMinor: 3800 }],
    });
  });
});
