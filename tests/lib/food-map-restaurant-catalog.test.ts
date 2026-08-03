import { describe, expect, it } from "vitest";

import {
  FOODLE_RESTAURANTS,
  getFoodleRestaurantsForStation,
  hasFoodleRestaurants,
} from "@/lib/food-map/restaurant-catalog";

describe("Foodle restaurant catalog", () => {
  it("provides multiple stable mock records for Sha Tin and Tai Po Market", () => {
    expect(getFoodleRestaurantsForStation("SHT")).toHaveLength(4);
    expect(getFoodleRestaurantsForStation("TAP")).toHaveLength(4);
    expect(getFoodleRestaurantsForStation("UNI")).toEqual([]);
    expect(hasFoodleRestaurants("SHT")).toBe(true);
    expect(hasFoodleRestaurants("UNI")).toBe(false);

    const ids = new Set(FOODLE_RESTAURANTS.map((restaurant) => restaurant.id));
    expect(ids.size).toBe(FOODLE_RESTAURANTS.length);
  });

  it("keeps source metadata separate from Foodle commute and community facts", () => {
    for (const restaurant of FOODLE_RESTAURANTS) {
      expect(restaurant.source.provider).toBe("openrice");
      expect(restaurant.source.externalId).toMatch(/^mock-/u);
      expect(restaurant.source.url).toContain(restaurant.source.externalId);
      expect(restaurant.sourceFacts.name.length).toBeGreaterThan(0);
      expect(["SHT", "TAP"]).toContain(restaurant.foodle.stationId);
    }
  });

  it("includes explicit missing-field fixture coverage", () => {
    expect(
      FOODLE_RESTAURANTS.some(
        (restaurant) =>
          restaurant.sourceFacts.cuisines === null &&
          restaurant.sourceFacts.priceRange === null &&
          restaurant.foodle.walkMinutes === null &&
          restaurant.foodle.averageScore === null,
      ),
    ).toBe(true);
  });
});
