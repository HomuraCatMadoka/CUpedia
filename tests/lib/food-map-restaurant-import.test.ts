import { describe, expect, it } from "vitest";

import {
  getFoodleCatalogState,
  importFoodleRestaurantSnapshot,
} from "@/lib/food-map/restaurant-import";

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    foodle_id: "foodle-sht-001",
    provider_record_id: "openrice-1001",
    canonical_url: "https://www.openrice.com/zh/hongkong/r/openrice-1001",
    updated_at: "2026-08-01T08:00:00+08:00",
    name: "围站冰室",
    cuisines: ["港式", "茶餐厅"],
    price_range: "HK$51 至 100",
    opening_state: "open",
    opening_label: "营业中，22:00 关门",
    image_urls: ["/foodle-sketch/cha-chaan-teng-meal.svg"],
    station_id: "SHT",
    walk_minutes: 4,
    average_score: 4.3,
    unique_visitors: 21,
    total_checkins: 37,
    ...overrides,
  };
}

function snapshot(restaurants: unknown[]) {
  return {
    version: 1,
    provider: "openrice",
    acquired_at: "2026-08-01T09:00:00+08:00",
    restaurants,
  };
}

describe("Foodle restaurant snapshot import", () => {
  it("keeps provider metadata separate from stable Foodle identity", () => {
    const first = importFoodleRestaurantSnapshot(snapshot([row()]));
    const refreshed = importFoodleRestaurantSnapshot(
      snapshot([
        row({
          name: "围站新冰室",
          canonical_url:
            "https://www.openrice.com/zh/hongkong/r/openrice-1001?ref=refresh",
          updated_at: "2026-08-02T08:00:00+08:00",
        }),
      ]),
    );

    expect(first.restaurants).toHaveLength(1);
    expect(first.restaurants[0].id).toBe("foodle-sht-001");
    expect(first.restaurants[0].source.externalId).toBe("openrice-1001");
    expect(refreshed.restaurants[0].id).toBe(first.restaurants[0].id);
    expect(refreshed.restaurants[0].sourceFacts.name).toBe("围站新冰室");
    expect(refreshed.restaurants[0].source.updatedAt).toBe(
      "2026-08-02T08:00:00+08:00",
    );
  });

  it("reports bad and duplicate rows while preserving valid records", () => {
    const imported = importFoodleRestaurantSnapshot(
      snapshot([
        row(),
        row({ foodle_id: "foodle-sht-duplicate" }),
        row({
          foodle_id: "foodle-bad-opening",
          provider_record_id: "openrice-1002",
          opening_state: "maybe",
        }),
        row({
          foodle_id: "foodle-bad-station",
          provider_record_id: "openrice-1003",
          station_id: "NOT_A_STATION",
        }),
      ]),
    );

    expect(imported.restaurants.map((restaurant) => restaurant.id)).toEqual([
      "foodle-sht-001",
    ]);
    expect(imported.status).toBe("partial");
    expect(imported.issues.map((issue) => issue.code)).toEqual([
      "duplicate_provider_record",
      "unsupported_opening_state",
      "unsupported_station",
    ]);
    expect(imported.issues.every((issue) => issue.row >= 1)).toBe(true);
  });

  it("does not invent missing facts and rejects an unusable input", () => {
    const partial = importFoodleRestaurantSnapshot(
      snapshot([
        row({
          canonical_url: null,
          cuisines: null,
          price_range: null,
          opening_state: "unknown",
          opening_label: null,
          image_urls: [],
          walk_minutes: null,
          average_score: null,
          unique_visitors: null,
          total_checkins: null,
        }),
      ]),
    );

    expect(partial.restaurants[0]).toMatchObject({
      source: { url: null, imageUrls: [] },
      sourceFacts: { cuisines: null, priceRange: null },
      foodle: {
        walkMinutes: null,
        averageScore: null,
        uniqueVisitors: null,
        totalCheckins: null,
      },
    });

    const failed = importFoodleRestaurantSnapshot({ provider: "openrice" });
    expect(failed.status).toBe("failed");
    expect(failed.restaurants).toEqual([]);
    expect(failed.issues[0].code).toBe("invalid_snapshot");
  });

  it("classifies empty, partial, stale and fresh catalog states", () => {
    const fresh = importFoodleRestaurantSnapshot(snapshot([row()]));
    const partial = importFoodleRestaurantSnapshot(
      snapshot([
        row(),
        row({ foodle_id: "bad", provider_record_id: "bad", station_id: "bad" }),
      ]),
    );

    expect(getFoodleCatalogState(fresh, new Date("2026-08-04T00:00:00Z"))).toBe(
      "ready",
    );
    expect(
      getFoodleCatalogState(partial, new Date("2026-08-04T00:00:00Z")),
    ).toBe("partial");
    expect(getFoodleCatalogState(fresh, new Date("2026-10-01T00:00:00Z"))).toBe(
      "stale",
    );
    expect(
      getFoodleCatalogState(
        importFoodleRestaurantSnapshot(snapshot([])),
        new Date("2026-08-04T00:00:00Z"),
      ),
    ).toBe("empty");
    expect(
      getFoodleCatalogState(
        importFoodleRestaurantSnapshot(null),
        new Date("2026-08-04T00:00:00Z"),
      ),
    ).toBe("failed");
  });
});
