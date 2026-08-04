import { describe, expect, it } from "vitest";

import {
  FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
  FOOD_MAP_WISHLIST_STORAGE_KEY,
  clearCandidateDecision,
  decideCandidate,
  emptyCandidateDecisionStore,
  getCandidateDecision,
  parseCandidateDecisionStore,
  serializeCandidateDecisionStore,
} from "@/lib/food-map/candidate-decisions";

describe("Foodle candidate decisions", () => {
  it("keeps the station wishlist separate from Match migration state", () => {
    expect(FOOD_MAP_WISHLIST_STORAGE_KEY).not.toBe(
      FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
    );
  });

  it("starts unseen and lets the latest explicit decision win", () => {
    const empty = emptyCandidateDecisionStore();
    expect(getCandidateDecision(empty, "restaurant-1")).toBe("unseen");

    const saved = decideCandidate(
      empty,
      "restaurant-1",
      "saved",
      "2026-07-31T08:00:00Z",
    );
    expect(getCandidateDecision(saved, "restaurant-1")).toBe("saved");

    const passed = decideCandidate(
      saved,
      "restaurant-1",
      "passed",
      "2026-07-31T09:00:00Z",
    );
    expect(getCandidateDecision(passed, "restaurant-1")).toBe("passed");
    expect(passed.byRestaurantId["restaurant-1"].decidedAt).toBe(
      "2026-07-31T09:00:00Z",
    );

    const cleared = clearCandidateDecision(passed, "restaurant-1");
    expect(getCandidateDecision(cleared, "restaurant-1")).toBe("unseen");
    expect(clearCandidateDecision(cleared, "missing")).toBe(cleared);
  });

  it("round-trips valid records and drops malformed entries", () => {
    const store = decideCandidate(
      emptyCandidateDecisionStore(),
      "restaurant-1",
      "saved",
    );
    expect(
      parseCandidateDecisionStore(serializeCandidateDecisionStore(store)),
    ).toEqual(store);

    expect(
      parseCandidateDecisionStore(
        JSON.stringify({
          version: 1,
          byRestaurantId: {
            good: { decision: "passed", decidedAt: "now" },
            bad: { decision: "maybe", decidedAt: 1 },
          },
        }),
      ).byRestaurantId,
    ).toEqual({ good: { decision: "passed", decidedAt: "now" } });
    expect(parseCandidateDecisionStore("not-json")).toEqual(
      emptyCandidateDecisionStore(),
    );
  });
});
