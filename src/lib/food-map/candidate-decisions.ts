export const FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY =
  "cupedia:foodle-candidate-decisions:v1";
export const FOOD_MAP_WISHLIST_STORAGE_KEY = "cupedia:food-map-wishlist:v1";

export type CandidateDecision = "saved" | "passed";
export type CandidateDecisionState = "unseen" | CandidateDecision;

export interface CandidateDecisionRecord {
  decision: CandidateDecision;
  decidedAt: string;
}

export interface CandidateDecisionStore {
  version: 1;
  byRestaurantId: Record<string, CandidateDecisionRecord>;
}

export function emptyCandidateDecisionStore(): CandidateDecisionStore {
  return { version: 1, byRestaurantId: {} };
}

export function parseCandidateDecisionStore(
  value: string | null,
): CandidateDecisionStore {
  if (!value) return emptyCandidateDecisionStore();

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return emptyCandidateDecisionStore();
    }

    const candidate = parsed as {
      version?: unknown;
      byRestaurantId?: unknown;
    };
    if (candidate.version !== 1 || !candidate.byRestaurantId) {
      return emptyCandidateDecisionStore();
    }

    const records: Record<string, CandidateDecisionRecord> = {};
    for (const [restaurantId, rawRecord] of Object.entries(
      candidate.byRestaurantId as Record<string, unknown>,
    )) {
      if (!rawRecord || typeof rawRecord !== "object") continue;
      const record = rawRecord as {
        decision?: unknown;
        decidedAt?: unknown;
      };
      if (
        (record.decision === "saved" || record.decision === "passed") &&
        typeof record.decidedAt === "string"
      ) {
        records[restaurantId] = {
          decision: record.decision,
          decidedAt: record.decidedAt,
        };
      }
    }

    return { version: 1, byRestaurantId: records };
  } catch {
    return emptyCandidateDecisionStore();
  }
}

export function serializeCandidateDecisionStore(store: CandidateDecisionStore) {
  return JSON.stringify(store);
}

export function getCandidateDecision(
  store: CandidateDecisionStore,
  restaurantId: string,
): CandidateDecisionState {
  return store.byRestaurantId[restaurantId]?.decision ?? "unseen";
}

export function decideCandidate(
  store: CandidateDecisionStore,
  restaurantId: string,
  decision: CandidateDecision,
  decidedAt = new Date().toISOString(),
): CandidateDecisionStore {
  return {
    version: 1,
    byRestaurantId: {
      ...store.byRestaurantId,
      [restaurantId]: { decision, decidedAt },
    },
  };
}

export function clearCandidateDecision(
  store: CandidateDecisionStore,
  restaurantId: string,
): CandidateDecisionStore {
  const id = restaurantId.trim();
  if (!id || !store.byRestaurantId[id]) return store;

  const byRestaurantId = { ...store.byRestaurantId };
  delete byRestaurantId[id];
  return { version: 1, byRestaurantId };
}
