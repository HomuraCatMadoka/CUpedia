import { createHash } from "node:crypto";
import {
  CANTEEN_MENU_SOURCE_PROVIDERS,
  type CanteenMenuSourceProvider,
} from "@/db/schema";
import { compareProviderText } from "./canteen-provider-menu-ordering";
import type {
  ApprovedMenuIdentityReplacement,
  ExistingSyncMenuItem,
} from "./canteen-menu-sync";
import type {
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncItemInput,
} from "./canteen-types";

export type MenuIdentityTransitionEvidence = {
  externalProductId: string;
  normalizedName: string;
  mealPeriods: MealPeriodAssignment[];
  priceOptions: MenuItemPriceOptionInput[];
};

export type MenuIdentityReplacementCandidate = {
  itemId: string;
  previous: MenuIdentityTransitionEvidence;
  next: MenuIdentityTransitionEvidence;
};

export type MenuIdentityTransitionAmbiguity = {
  normalizedName: string;
  previous: Array<{
    itemId: string;
    evidence: MenuIdentityTransitionEvidence;
  }>;
  next: MenuIdentityTransitionEvidence[];
};

export type MenuIdentityTransitionAudit = {
  summary: {
    existingCount: number;
    incomingCount: number;
    missingIdentityCount: number;
    newIdentityCount: number;
    replacementCandidateCount: number;
    additionCount: number;
    removalCount: number;
    ambiguityCount: number;
  };
  existingFingerprint: string;
  incomingFingerprint: string;
  replacementCandidates: MenuIdentityReplacementCandidate[];
  additions: MenuIdentityTransitionEvidence[];
  removals: Array<{
    itemId: string;
    evidence: MenuIdentityTransitionEvidence;
  }>;
  ambiguities: MenuIdentityTransitionAmbiguity[];
};

export type MenuIdentityTransitionArtifact = {
  schemaVersion: 2;
  source: {
    provider: CanteenMenuSourceProvider;
    externalOwnerId: string | null;
    externalStoreId: string;
    configurationFingerprint: string;
  };
  audit: MenuIdentityTransitionAudit;
  decisions: {
    snapshotScope:
      | { status: "unreviewed"; rationale: "" }
      | {
          status: "complete" | "wrong-or-incomplete";
          rationale: string;
        };
    replacements: Array<
      ApprovedMenuIdentityReplacement & { rationale: string }
    >;
    additions: string[];
    removals: Array<{ itemId: string; externalProductId: string }>;
    ambiguities: Array<{
      previousProductIds: string[];
      nextProductIds: string[];
      rationale: string;
    }>;
  };
};

export type MenuIdentityTransitionSourceConfiguration = {
  id: string;
  canteenId: string;
  provider: CanteenMenuSourceProvider;
  externalOwnerId: string | null;
  externalStoreId: string;
  config: unknown;
  enabled: boolean;
  legacyTakeoverAt: Date | string | null;
};

type ExistingEvidence = {
  itemId: string;
  evidence: MenuIdentityTransitionEvidence;
};

const IDENTITY_TRANSITION_ITEM_LIMIT = 500;

export function fingerprintMenuIdentityTransitionSource(
  source: MenuIdentityTransitionSourceConfiguration,
): string {
  return fingerprint({
    id: source.id,
    canteenId: source.canteenId,
    provider: source.provider,
    externalOwnerId: source.externalOwnerId,
    externalStoreId: source.externalStoreId,
    config: canonicalJson(source.config),
    enabled: source.enabled,
    legacyTakeoverAt:
      source.legacyTakeoverAt instanceof Date
        ? source.legacyTakeoverAt.toISOString()
        : source.legacyTakeoverAt,
  });
}

/** Build a deterministic, read-only audit of identity changes. */
export function buildMenuIdentityTransitionAudit(
  existingItems: readonly ExistingSyncMenuItem[],
  incomingItems: readonly MenuSyncItemInput[],
): MenuIdentityTransitionAudit {
  if (
    existingItems.length > IDENTITY_TRANSITION_ITEM_LIMIT ||
    incomingItems.length > IDENTITY_TRANSITION_ITEM_LIMIT
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_TOO_LARGE");
  }
  const existingFingerprint = fingerprint(
    existingItems
      .filter(
        (item): item is ExistingSyncMenuItem & { externalProductId: string } =>
          item.externalProductId !== null,
      )
      .map((item) => ({
        itemId: item.id,
        externalProductId: item.externalProductId,
        name: item.name,
        mealPeriods: [...item.mealPeriods].sort(),
        sortOrder: item.sortOrder,
        svgKey: item.svgKey,
        priceOptions: canonicalizePriceOptions(item.priceOptions),
        menuSourceId: item.menuSourceId,
        isAvailable: item.isAvailable,
      }))
      .sort((left, right) => compareProviderText(left.itemId, right.itemId)),
  );
  const incomingFingerprint = fingerprint(
    incomingItems
      .map((item) => ({
        externalProductId: item.externalProductId,
        name: item.name,
        mealPeriods: [...item.mealPeriods].sort(),
        sortOrder: item.sortOrder,
        svgKey: item.svgKey,
        priceOptions: canonicalizePriceOptions(item.priceOptions),
      }))
      .sort((left, right) =>
        compareProviderText(left.externalProductId, right.externalProductId),
      ),
  );
  const activeExistingIds = new Set(
    existingItems
      .filter((item) => item.isAvailable && item.externalProductId !== null)
      .map((item) => item.id),
  );
  const existing = existingItems
    .filter(
      (item): item is ExistingSyncMenuItem & { externalProductId: string } =>
        item.externalProductId !== null,
    )
    .map((item) => ({
      itemId: item.id,
      evidence: evidenceFor(item),
    }))
    .sort(compareExistingEvidence);
  const incoming = incomingItems
    .map(evidenceFor)
    .sort(compareTransitionEvidence);
  const knownExistingIds = new Set(
    existingItems.flatMap((item) =>
      item.externalProductId === null ? [] : [item.externalProductId],
    ),
  );
  const incomingIds = new Set(incoming.map((item) => item.externalProductId));
  const unmatchedExisting = existing.filter(
    (item) => !incomingIds.has(item.evidence.externalProductId),
  );
  const unmatchedIncoming = incoming.filter(
    (item) => !knownExistingIds.has(item.externalProductId),
  );
  const previousByName = groupExistingByNormalizedName(unmatchedExisting);
  const nextByName = groupByNormalizedName(unmatchedIncoming);
  const replacementCandidates: MenuIdentityReplacementCandidate[] = [];
  const additions: MenuIdentityTransitionEvidence[] = [];
  const removals: ExistingEvidence[] = [];
  const ambiguities: MenuIdentityTransitionAmbiguity[] = [];

  for (const normalizedName of [
    ...new Set([...previousByName.keys(), ...nextByName.keys()]),
  ].sort()) {
    const previous = previousByName.get(normalizedName) ?? [];
    const next = nextByName.get(normalizedName) ?? [];
    if (previous.length === 1 && next.length === 1) {
      replacementCandidates.push({
        itemId: previous[0].itemId,
        previous: previous[0].evidence,
        next: next[0],
      });
    } else if (previous.length > 0 && next.length > 0) {
      ambiguities.push({
        normalizedName,
        previous,
        next,
      });
    } else if (previous.length > 0) {
      removals.push(
        ...previous.filter((item) => activeExistingIds.has(item.itemId)),
      );
    } else {
      additions.push(...next);
    }
  }

  return {
    summary: {
      existingCount: activeExistingIds.size,
      incomingCount: incoming.length,
      missingIdentityCount: unmatchedExisting.filter((item) =>
        activeExistingIds.has(item.itemId),
      ).length,
      newIdentityCount: unmatchedIncoming.length,
      replacementCandidateCount: replacementCandidates.length,
      additionCount: additions.length,
      removalCount: removals.length,
      ambiguityCount: ambiguities.length,
    },
    existingFingerprint,
    incomingFingerprint,
    replacementCandidates,
    additions,
    removals,
    ambiguities,
  };
}

export function verifyMenuIdentityTransitionArtifact(
  source: MenuIdentityTransitionArtifact["source"],
  existingItems: readonly ExistingSyncMenuItem[],
  incomingItems: readonly MenuSyncItemInput[],
  artifactInput: unknown,
): ApprovedMenuIdentityReplacement[] {
  const artifact = parseMenuIdentityTransitionArtifact(artifactInput);
  if (
    artifact.schemaVersion !== 2 ||
    artifact.source.provider !== source.provider ||
    artifact.source.externalOwnerId !== source.externalOwnerId ||
    artifact.source.externalStoreId !== source.externalStoreId ||
    artifact.source.configurationFingerprint !== source.configurationFingerprint
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_SOURCE_MISMATCH");
  }
  const currentAudit = buildMenuIdentityTransitionAudit(
    existingItems,
    incomingItems,
  );
  if (
    fingerprint(canonicalJson(currentAudit)) !==
    fingerprint(canonicalJson(artifact.audit))
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_STALE");
  }
  if (currentAudit.ambiguities.length > 0) {
    throw new Error("MENU_IDENTITY_TRANSITION_AMBIGUOUS");
  }
  const previous = new Map(
    [
      ...currentAudit.replacementCandidates.map((candidate) => ({
        itemId: candidate.itemId,
        externalProductId: candidate.previous.externalProductId,
      })),
      ...currentAudit.removals.map((removal) => ({
        itemId: removal.itemId,
        externalProductId: removal.evidence.externalProductId,
      })),
    ].map((item) => [item.externalProductId, item]),
  );
  const next = new Set([
    ...currentAudit.replacementCandidates.map(
      (candidate) => candidate.next.externalProductId,
    ),
    ...currentAudit.additions.map((addition) => addition.externalProductId),
  ]);
  const decisions = artifact.decisions;
  if (
    !decisions ||
    !Array.isArray(decisions.replacements) ||
    !Array.isArray(decisions.additions) ||
    !Array.isArray(decisions.removals) ||
    !Array.isArray(decisions.ambiguities)
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
  }
  if (decisions.snapshotScope.status !== "complete") {
    throw new Error("MENU_IDENTITY_TRANSITION_SCOPE_REJECTED");
  }
  const coveredPrevious = new Set<string>();
  const coveredNext = new Set<string>();
  for (const ambiguity of decisions.ambiguities) {
    if (
      !ambiguity.previousProductIds.every(
        (id) => previous.has(id) && !coveredPrevious.has(id),
      ) ||
      !ambiguity.nextProductIds.every(
        (id) => next.has(id) && !coveredNext.has(id),
      )
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
    }
    ambiguity.previousProductIds.forEach((id) => coveredPrevious.add(id));
    ambiguity.nextProductIds.forEach((id) => coveredNext.add(id));
  }
  const approvedReplacements: ApprovedMenuIdentityReplacement[] = [];
  for (const replacement of decisions.replacements) {
    const matchedPrevious = previous.get(replacement.previousProductId);
    if (
      !matchedPrevious ||
      matchedPrevious.itemId !== replacement.itemId ||
      !next.has(replacement.nextProductId) ||
      !replacement.rationale.trim() ||
      coveredPrevious.has(replacement.previousProductId) ||
      coveredNext.has(replacement.nextProductId)
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
    }
    coveredPrevious.add(replacement.previousProductId);
    coveredNext.add(replacement.nextProductId);
    approvedReplacements.push({
      itemId: replacement.itemId,
      previousProductId: replacement.previousProductId,
      nextProductId: replacement.nextProductId,
    });
  }
  for (const addition of decisions.additions) {
    if (!next.has(addition) || coveredNext.has(addition)) {
      throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
    }
    coveredNext.add(addition);
  }
  for (const removal of decisions.removals) {
    const matchedPrevious = previous.get(removal.externalProductId);
    if (
      !matchedPrevious ||
      matchedPrevious.itemId !== removal.itemId ||
      coveredPrevious.has(removal.externalProductId)
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
    }
    coveredPrevious.add(removal.externalProductId);
  }
  if (
    coveredPrevious.size !== previous.size ||
    coveredNext.size !== next.size
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_INCOMPLETE_DECISIONS");
  }
  if (decisions.ambiguities.length > 0) {
    throw new Error("MENU_IDENTITY_TRANSITION_AMBIGUOUS");
  }
  return approvedReplacements.sort((left, right) =>
    compareProviderText(left.nextProductId, right.nextProductId),
  );
}

export function parseMenuIdentityTransitionArtifact(
  input: unknown,
): MenuIdentityTransitionArtifact {
  const artifact = record(input);
  const source = record(artifact?.source);
  const audit = record(artifact?.audit);
  const decisions = record(artifact?.decisions);
  if (
    artifact?.schemaVersion !== 2 ||
    !source ||
    typeof source.provider !== "string" ||
    !CANTEEN_MENU_SOURCE_PROVIDERS.includes(
      source.provider as CanteenMenuSourceProvider,
    ) ||
    (source.externalOwnerId !== null &&
      typeof source.externalOwnerId !== "string") ||
    typeof source.externalStoreId !== "string" ||
    !source.externalStoreId ||
    typeof source.configurationFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(source.configurationFingerprint) ||
    !audit ||
    !decisions ||
    !validSnapshotScopeDecision(decisions.snapshotScope) ||
    !Array.isArray(decisions.replacements) ||
    !decisions.replacements.every(validReplacementDecision) ||
    !Array.isArray(decisions.additions) ||
    !decisions.additions.every((value) => typeof value === "string" && value) ||
    !Array.isArray(decisions.removals) ||
    !decisions.removals.every(validRemovalDecision) ||
    !Array.isArray(decisions.ambiguities) ||
    !decisions.ambiguities.every(validAmbiguityDecision)
  ) {
    throw new Error("INVALID_MENU_IDENTITY_TRANSITION_ARTIFACT");
  }
  return input as MenuIdentityTransitionArtifact;
}

function validAmbiguityDecision(value: unknown): boolean {
  const decision = record(value);
  return Boolean(
    decision &&
    Array.isArray(decision.previousProductIds) &&
    decision.previousProductIds.length > 0 &&
    decision.previousProductIds.every(validIdentity) &&
    new Set(decision.previousProductIds).size ===
      decision.previousProductIds.length &&
    Array.isArray(decision.nextProductIds) &&
    decision.nextProductIds.length > 0 &&
    decision.nextProductIds.every(validIdentity) &&
    new Set(decision.nextProductIds).size === decision.nextProductIds.length &&
    typeof decision.rationale === "string" &&
    decision.rationale.trim() &&
    decision.rationale.length <= 500,
  );
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && Boolean(value);
}

function validSnapshotScopeDecision(value: unknown): boolean {
  const decision = record(value);
  if (!decision || typeof decision.status !== "string") return false;
  if (decision.status === "unreviewed") return decision.rationale === "";
  return (
    ["complete", "wrong-or-incomplete"].includes(decision.status) &&
    typeof decision.rationale === "string" &&
    Boolean(decision.rationale.trim()) &&
    decision.rationale.length <= 500
  );
}

function validReplacementDecision(value: unknown): boolean {
  const decision = record(value);
  return Boolean(
    decision &&
    typeof decision.itemId === "string" &&
    decision.itemId &&
    typeof decision.previousProductId === "string" &&
    decision.previousProductId &&
    typeof decision.nextProductId === "string" &&
    decision.nextProductId &&
    typeof decision.rationale === "string" &&
    decision.rationale.trim() &&
    decision.rationale.length <= 500,
  );
}

function validRemovalDecision(value: unknown): boolean {
  const decision = record(value);
  return Boolean(
    decision &&
    typeof decision.itemId === "string" &&
    decision.itemId &&
    typeof decision.externalProductId === "string" &&
    decision.externalProductId,
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function evidenceFor(
  item: ExistingSyncMenuItem | MenuSyncItemInput,
): MenuIdentityTransitionEvidence {
  if (item.externalProductId === null) {
    throw new Error("MENU_IDENTITY_TRANSITION_MISSING_IDENTITY");
  }
  return {
    externalProductId: item.externalProductId,
    normalizedName: normalizeName(item.name),
    mealPeriods: [...item.mealPeriods].sort(),
    priceOptions: canonicalizePriceOptions(item.priceOptions),
  };
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function groupExistingByNormalizedName(
  items: readonly ExistingEvidence[],
): Map<string, ExistingEvidence[]> {
  const grouped = new Map<string, ExistingEvidence[]>();
  for (const item of items) {
    const key = item.evidence.normalizedName;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function groupByNormalizedName(
  items: readonly MenuIdentityTransitionEvidence[],
): Map<string, MenuIdentityTransitionEvidence[]> {
  const grouped = new Map<string, MenuIdentityTransitionEvidence[]>();
  for (const item of items) {
    const key = item.normalizedName;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function compareExistingEvidence(
  left: ExistingEvidence,
  right: ExistingEvidence,
): number {
  return (
    compareTransitionEvidence(left.evidence, right.evidence) ||
    compareProviderText(left.itemId, right.itemId)
  );
}

function compareTransitionEvidence(
  left: MenuIdentityTransitionEvidence,
  right: MenuIdentityTransitionEvidence,
): number {
  return compareProviderText(left.externalProductId, right.externalProductId);
}

function canonicalizePriceOptions(
  options: readonly MenuItemPriceOptionInput[],
): MenuItemPriceOptionInput[] {
  return [...options]
    .sort(
      (left, right) =>
        compareProviderText(left.label ?? "", right.label ?? "") ||
        left.amountMinor - right.amountMinor ||
        compareProviderText(left.currency, right.currency),
    )
    .map((option, sortOrder) => ({ ...option, sortOrder }));
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  const object = record(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, canonicalJson(object[key])]),
  );
}
