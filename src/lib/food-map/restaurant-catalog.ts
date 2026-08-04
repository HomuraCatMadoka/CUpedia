import type { MtrStationId } from "@/lib/food-map/data";
import openRiceSnapshot from "@/data/foodle/openrice-shaped-snapshot.json";
import {
  getFoodleCatalogState,
  importFoodleRestaurantSnapshot,
} from "@/lib/food-map/restaurant-import";

export type RestaurantOpeningState = "open" | "closed" | "unknown";

export interface RestaurantSourceMetadata {
  provider: "openrice";
  externalId: string;
  url: string | null;
  imageUrls: readonly string[];
  acquiredAt: string;
  updatedAt: string;
}

export interface RestaurantSourceFacts {
  name: string;
  cuisines: readonly string[] | null;
  priceRange: string | null;
  openingState: RestaurantOpeningState;
  openingLabel: string | null;
}

export interface FoodleRestaurantFacts {
  stationId: MtrStationId;
  walkMinutes: number | null;
  averageScore: number | null;
  uniqueVisitors: number | null;
  totalCheckins: number | null;
}

export interface FoodleRestaurant {
  id: string;
  source: RestaurantSourceMetadata;
  sourceFacts: RestaurantSourceFacts;
  foodle: FoodleRestaurantFacts;
}

export const FOODLE_RESTAURANT_IMPORT =
  importFoodleRestaurantSnapshot(openRiceSnapshot);
export const FOODLE_RESTAURANTS: readonly FoodleRestaurant[] =
  FOODLE_RESTAURANT_IMPORT.restaurants;
export const FOODLE_RESTAURANT_CATALOG_STATE = getFoodleCatalogState(
  FOODLE_RESTAURANT_IMPORT,
);

export function getFoodleRestaurantsForStation(stationId: MtrStationId) {
  return FOODLE_RESTAURANTS.filter(
    (restaurant) => restaurant.foodle.stationId === stationId,
  );
}

export function hasFoodleRestaurants(stationId: MtrStationId) {
  return FOODLE_RESTAURANTS.some(
    (restaurant) => restaurant.foodle.stationId === stationId,
  );
}
