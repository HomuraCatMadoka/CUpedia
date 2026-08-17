import { createHash } from "node:crypto";
import {
  snapshotAbsenceIsEvidence,
  type MenuSnapshotCompleteness,
} from "./canteen-menu-snapshot-completeness";

declare const redactedMenuSampleBrand: unique symbol;
export type RedactedMenuSample = string & {
  readonly [redactedMenuSampleBrand]: true;
};

export type MenuIdentityObservation = {
  newProductCount: number;
  missingProductCount: number;
  newProductSamples: RedactedMenuSample[];
  missingProductSamples: RedactedMenuSample[];
  suspectedReplacementCount: number;
  suspectedReplacementSamples: Array<{
    previousProductId: RedactedMenuSample;
    nextProductId: RedactedMenuSample;
  }>;
  truncated: boolean;
};

const OBSERVATION_ID_LIMIT = 25;
const MIN_CHURN_COUNT = 3;
const CHURN_RATIO_PERCENT = 25;

function normalizedName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function observeMenuIdentityChurn(
  existing: Array<{
    externalProductId: string;
    name: string;
    isAvailable?: boolean;
  }>,
  incoming: Array<{ externalProductId: string; name: string }>,
): MenuIdentityObservation {
  const existingIds = new Set(existing.map((item) => item.externalProductId));
  const incomingIds = new Set(incoming.map((item) => item.externalProductId));
  const newItems = incoming.filter(
    (item) => !existingIds.has(item.externalProductId),
  );
  const missingItems = existing.filter(
    (item) =>
      item.isAvailable !== false && !incomingIds.has(item.externalProductId),
  );
  const newByName = new Map<string, typeof newItems>();
  const missingByName = new Map<string, typeof missingItems>();
  for (const item of newItems) {
    const key = normalizedName(item.name);
    newByName.set(key, [...(newByName.get(key) ?? []), item]);
  }
  for (const item of missingItems) {
    const key = normalizedName(item.name);
    missingByName.set(key, [...(missingByName.get(key) ?? []), item]);
  }
  const suspectedReplacements: Array<{
    previousProductId: string;
    nextProductId: string;
  }> = [];
  for (const [name, previous] of missingByName) {
    const next = newByName.get(name) ?? [];
    if (previous.length === 1 && next.length === 1) {
      suspectedReplacements.push({
        previousProductId: previous[0].externalProductId,
        nextProductId: next[0].externalProductId,
      });
    }
  }
  return {
    newProductCount: newItems.length,
    missingProductCount: missingItems.length,
    newProductSamples: newItems
      .slice(0, OBSERVATION_ID_LIMIT)
      .map((item) => redactMenuDiagnosticSample(item.externalProductId)),
    missingProductSamples: missingItems
      .slice(0, OBSERVATION_ID_LIMIT)
      .map((item) => redactMenuDiagnosticSample(item.externalProductId)),
    suspectedReplacementCount: suspectedReplacements.length,
    suspectedReplacementSamples: suspectedReplacements
      .slice(0, OBSERVATION_ID_LIMIT)
      .map((replacement) => ({
        previousProductId: redactMenuDiagnosticSample(
          replacement.previousProductId,
        ),
        nextProductId: redactMenuDiagnosticSample(replacement.nextProductId),
      })),
    truncated:
      newItems.length > OBSERVATION_ID_LIMIT ||
      missingItems.length > OBSERVATION_ID_LIMIT ||
      suspectedReplacements.length > OBSERVATION_ID_LIMIT,
  };
}

export function redactMenuDiagnosticSample(value: string): RedactedMenuSample {
  return createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 12) as RedactedMenuSample;
}

export function isSuspiciousMenuIdentityChurn(
  observation: MenuIdentityObservation,
  existingCount: number,
  snapshotCompleteness: MenuSnapshotCompleteness,
): boolean {
  const changed = snapshotAbsenceIsEvidence(snapshotCompleteness)
    ? Math.max(observation.newProductCount, observation.missingProductCount)
    : observation.newProductCount;
  return (
    observation.suspectedReplacementCount > 0 ||
    (changed >= MIN_CHURN_COUNT &&
      changed * 100 >= existingCount * CHURN_RATIO_PERCENT)
  );
}
