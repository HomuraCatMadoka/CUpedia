import {
  getCandidateDecision,
  type CandidateDecisionStore,
} from "@/lib/food-map/candidate-decisions";
import {
  type FoodMapBudget,
  MTR_STATIONS,
  type MtrStationId,
} from "@/lib/food-map/data";
import {
  FOODLE_RESTAURANTS,
  type FoodleRestaurant,
} from "@/lib/food-map/restaurant-catalog";

const stationMinutes = new Map(
  MTR_STATIONS.map((station) => [station.id, station.minutes]),
);

export interface FoodleDiscoveryBatchInput {
  budget: FoodMapBudget;
  stationId: MtrStationId | null;
  decisions: CandidateDecisionStore;
}

function firstCuisine(restaurant: FoodleRestaurant) {
  return restaurant.sourceFacts.cuisines?.[0] ?? null;
}

export function buildFoodleDiscoveryBatch({
  budget,
  stationId,
  decisions,
}: FoodleDiscoveryBatchInput) {
  const eligible = FOODLE_RESTAURANTS.filter((restaurant) => {
    const restaurantStationId = restaurant.foodle.stationId;
    return (
      (stationId === null || restaurantStationId === stationId) &&
      (stationMinutes.get(restaurantStationId) ?? Number.POSITIVE_INFINITY) <=
        budget &&
      getCandidateDecision(decisions, restaurant.id) === "unseen"
    );
  });
  const queues = new Map<MtrStationId, FoodleRestaurant[]>();
  for (const restaurant of eligible) {
    const queue = queues.get(restaurant.foodle.stationId) ?? [];
    queue.push(restaurant);
    queues.set(restaurant.foodle.stationId, queue);
  }
  const batch: FoodleRestaurant[] = [];

  while (
    batch.length < 8 &&
    [...queues.values()].some((queue) => queue.length)
  ) {
    for (const queue of queues.values()) {
      if (batch.length === 8 || queue.length === 0) continue;
      const previous = batch.at(-1);
      const previousCuisine = previous ? firstCuisine(previous) : null;
      const differentCuisine = queue.findIndex(
        (restaurant) => firstCuisine(restaurant) !== previousCuisine,
      );
      batch.push(queue.splice(Math.max(0, differentCuisine), 1)[0]);
    }
  }

  return batch;
}
