import { describe, expect, it } from "vitest";

import { emptyCandidateDecisionStore } from "@/lib/food-map/candidate-decisions";
import { buildFoodleDiscoveryBatch } from "@/lib/food-map/discovery";

describe("Foodle discovery batch", () => {
  it("returns at most eight unseen restaurants while alternating stations", () => {
    const batch = buildFoodleDiscoveryBatch({
      budget: 20,
      stationId: null,
      decisions: emptyCandidateDecisionStore(),
    });

    expect(batch).toHaveLength(8);
    for (let index = 1; index < batch.length; index += 1) {
      expect(batch[index].foodle.stationId).not.toBe(
        batch[index - 1].foodle.stationId,
      );
    }
  });

  it("represents later commute bands in a mixed-station batch", () => {
    const decisions = emptyCandidateDecisionStore();
    const twentyMinuteStations = new Set(
      buildFoodleDiscoveryBatch({
        budget: 20,
        stationId: null,
        decisions,
      }).map((restaurant) => restaurant.foodle.stationId),
    );
    const thirtyMinuteStations = new Set(
      buildFoodleDiscoveryBatch({
        budget: 30,
        stationId: null,
        decisions,
      }).map((restaurant) => restaurant.foodle.stationId),
    );

    expect(twentyMinuteStations).toContain("KOT");
    expect(thirtyMinuteStations).toContain("JOR");
  });
});
