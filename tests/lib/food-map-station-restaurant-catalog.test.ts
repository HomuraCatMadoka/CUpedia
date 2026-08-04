import { describe, expect, it } from "vitest";

import {
  FOODLE_STATION_MAPS,
  FOODLE_STATION_RESTAURANTS,
  getFoodleRestaurantsForStation,
  getRestaurantHeat,
  getRestaurantOpeningStatus,
  isFoodleStationId,
} from "@/lib/food-map/station-restaurant-catalog";
import { FOODLE_RESTAURANTS } from "@/lib/food-map/restaurant-catalog";

describe("Foodle station restaurant catalog", () => {
  it("provides multiple stable records for Sha Tin and Tai Po Market", () => {
    expect(getFoodleRestaurantsForStation("SHT")).toHaveLength(4);
    expect(getFoodleRestaurantsForStation("TAP")).toHaveLength(4);

    const ids = new Set(
      FOODLE_STATION_RESTAURANTS.map((restaurant) => restaurant.id),
    );
    expect(ids.size).toBe(FOODLE_STATION_RESTAURANTS.length);
  });

  it("keeps source metadata separate from Foodle-owned facts", () => {
    for (const restaurant of FOODLE_STATION_RESTAURANTS) {
      const canonical = FOODLE_RESTAURANTS.find(
        (item) => item.id === restaurant.id,
      );
      expect(canonical).toBeTruthy();
      expect(restaurant.source).toEqual(canonical?.source);
      expect(restaurant.sourceFacts.name).toBe(canonical?.sourceFacts.name);
      expect(restaurant.sourceFacts.cuisines).toEqual(
        canonical?.sourceFacts.cuisines,
      );
      expect(restaurant.sourceFacts.priceRange).toBe(
        canonical?.sourceFacts.priceRange,
      );
      expect(restaurant.foodle.walkMinutes).toBe(canonical?.foodle.walkMinutes);
      expect(restaurant.foodle.averageScore).toBe(
        canonical?.foodle.averageScore,
      );
      expect(restaurant.foodle.uniqueVisitors).toBe(
        canonical?.foodle.uniqueVisitors,
      );
      expect(restaurant.foodle.totalCheckins).toBe(
        canonical?.foodle.totalCheckins,
      );
      expect(restaurant.source.provider).toBe("openrice");
      expect(restaurant.source.externalId).toMatch(/^mock-/u);
      expect(restaurant.source.url).toContain(restaurant.source.externalId);
      expect(restaurant.sourceFacts.name.length).toBeGreaterThan(0);
      expect(["SHT", "TAP"]).toContain(restaurant.foodle.stationId);
      expect(restaurant.location.distanceMeters).toBeLessThanOrEqual(
        FOODLE_STATION_MAPS[restaurant.foodle.stationId].radiusMeters,
      );
    }
  });

  it("includes explicit missing-field fixture coverage", () => {
    expect(
      FOODLE_STATION_RESTAURANTS.some(
        (restaurant) =>
          restaurant.sourceFacts.cuisines === null &&
          restaurant.sourceFacts.priceRange === null &&
          restaurant.foodle.walkMinutes === null &&
          restaurant.foodle.averageScore === null,
      ),
    ).toBe(true);
  });

  it("derives current opening state in Hong Kong time", () => {
    const restaurant = FOODLE_STATION_RESTAURANTS[0];
    expect(
      getRestaurantOpeningStatus(
        restaurant,
        new Date("2026-08-04T04:00:00.000Z"),
      ),
    ).toEqual({ state: "open", label: "营业中 · 22:00 关门" });
    expect(
      getRestaurantOpeningStatus(
        restaurant,
        new Date("2026-08-04T15:00:00.000Z"),
      ).state,
    ).toBe("closed");
    expect(
      getRestaurantOpeningStatus(FOODLE_STATION_RESTAURANTS[3]).state,
    ).toBe("unknown");
  });

  it("uses a simple green-to-red heat scale with a fire tier", () => {
    expect([5, 20, 60, 90].map(getRestaurantHeat)).toEqual([
      "quiet",
      "known",
      "popular",
      "hot",
    ]);
    expect(isFoodleStationId("SHT")).toBe(true);
    expect(isFoodleStationId("UNI")).toBe(false);
  });
});
