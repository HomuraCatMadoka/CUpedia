import { createHash } from "node:crypto";
import {
  CANTEEN_MENU_SOURCE_PROVIDERS,
  type CanteenMenuSourceProvider,
} from "@/db/schema";
import { compareProviderText } from "./canteen-provider-menu-ordering";
import { normalizePublishedProviderIdentity } from "./canteen-provider-menu-identity";
import type {
  ApprovedMenuIdentityReplacement,
  ExistingSyncMenuItem,
} from "./canteen-menu-sync";
import {
  type MealPeriodAssignment,
  type MenuItemPriceOptionInput,
  type MenuSyncInput,
  type MenuSyncItemInput,
} from "./canteen-types";
import {
  MENU_SNAPSHOT_COMPLETENESS,
  assertProviderSnapshotCompleteness,
  assertProviderSnapshotScope,
  snapshotAbsenceIsEvidence,
} from "./canteen-menu-snapshot-completeness";

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

export type MenuIdentityMergeCandidate = {
  productIdentity: string;
  previous: Array<{
    itemId: string;
    evidence: MenuIdentityTransitionEvidence;
  }>;
  next: MenuIdentityTransitionEvidence | null;
};

export type MenuIdentityCanonicalizationCandidate = {
  itemId: string;
  previous: MenuIdentityTransitionEvidence;
  nextProductId: string;
  presentInSnapshot: boolean;
};

export type MenuIdentityTransitionAudit = {
  snapshotCompleteness: MenuSyncInput["snapshotCompleteness"];
  scopeEvidence: MenuSyncInput["scopeEvidence"] | null;
  summary: {
    existingCount: number;
    incomingCount: number;
    missingIdentityCount: number;
    newIdentityCount: number;
    replacementCandidateCount: number;
    canonicalizationCandidateCount: number;
    mergeCandidateCount: number;
    additionCount: number;
    removalCount: number;
    ambiguityCount: number;
  };
  existingFingerprint: string;
  incomingFingerprint: string;
  replacementCandidates: MenuIdentityReplacementCandidate[];
  canonicalizationCandidates: MenuIdentityCanonicalizationCandidate[];
  mergeCandidates: MenuIdentityMergeCandidate[];
  additions: MenuIdentityTransitionEvidence[];
  removals: Array<{
    itemId: string;
    evidence: MenuIdentityTransitionEvidence;
  }>;
  ambiguities: MenuIdentityTransitionAmbiguity[];
};

export type MenuIdentityTransitionStaleDetails = {
  existingMatches: boolean;
  incomingMatches: boolean;
  currentSummary: MenuIdentityTransitionAudit["summary"];
  currentScope:
    | {
        provider: "aigens";
        categoryCount: number;
        groupCount: number;
        providerPeriodCount: number;
        categoryPeriodCount: number;
      }
    | { provider: "pinme"; serviceWindowCount: number }
    | null;
};

class MenuIdentityTransitionStaleError extends Error {
  constructor(readonly details: MenuIdentityTransitionStaleDetails) {
    super("MENU_IDENTITY_TRANSITION_STALE");
  }
}

export function getMenuIdentityTransitionStaleDetails(
  error: unknown,
): MenuIdentityTransitionStaleDetails | null {
  return error instanceof MenuIdentityTransitionStaleError
    ? error.details
    : null;
}

type MenuIdentityTransitionArtifactSource = {
  provider: CanteenMenuSourceProvider;
  externalOwnerId: string | null;
  externalStoreId: string;
  configurationFingerprint: string;
};

export type LegacyMenuIdentityTransitionArtifact = {
  schemaVersion: 4;
  source: MenuIdentityTransitionArtifactSource;
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
    canonicalizations: Array<
      ApprovedMenuIdentityCanonicalization & { rationale: string }
    >;
    merges: MenuIdentityMergeDecision[];
    additions: string[];
    removals: Array<{ itemId: string; externalProductId: string }>;
    ambiguities: Array<{
      previousProductIds: string[];
      nextProductIds: string[];
      rationale: string;
    }>;
  };
};

export type MenuIdentityTransitionArtifactV5 = {
  schemaVersion: 5;
  source: MenuIdentityTransitionArtifactSource;
  audit: MenuIdentityTransitionAudit;
  decisions: {
    replacements: Array<
      ApprovedMenuIdentityReplacement & { rationale: string }
    >;
    canonicalizations: Array<
      ApprovedMenuIdentityCanonicalization & { rationale: string }
    >;
    merges: MenuIdentityMergeDecision[];
  };
};

export type MenuIdentityTransitionArtifact =
  | LegacyMenuIdentityTransitionArtifact
  | MenuIdentityTransitionArtifactV5;

export type MenuIdentityMergeDecision = {
  survivorItemId: string;
  mergedItemIds: string[];
  previousProductIds: string[];
  nextProductId: string;
  duplicateVotePolicy: "deduplicate-identical";
  rationale: string;
};

export type ApprovedMenuIdentityMerge = Omit<
  MenuIdentityMergeDecision,
  "rationale"
>;

export type ApprovedMenuIdentityCanonicalization = {
  itemId: string;
  previousProductId: string;
  nextProductId: string;
};

export type ApprovedMenuIdentityTransition = {
  replacements: ApprovedMenuIdentityReplacement[];
  canonicalizations: ApprovedMenuIdentityCanonicalization[];
  merges: ApprovedMenuIdentityMerge[];
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
  input: Pick<
    MenuSyncInput,
    "snapshotCompleteness" | "scopeEvidence" | "items"
  >,
  provider?: CanteenMenuSourceProvider,
): MenuIdentityTransitionAudit {
  const incomingItems = input.items;
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
        priceOptions: existingPriceOptionsForV4Fingerprint(item.priceOptions),
        menuSourceId: item.menuSourceId,
        isAvailable: item.isAvailable,
      }))
      .sort((left, right) => compareProviderText(left.itemId, right.itemId)),
  );
  const incomingFingerprint = fingerprint({
    snapshotCompleteness: input.snapshotCompleteness,
    scopeEvidence: scopeEvidenceForFingerprint(input.scopeEvidence),
    items: incomingItems
      .map((item) => ({
        externalProductId: item.externalProductId,
        name: item.name,
        mealPeriods: [...item.mealPeriods].sort(),
        sortOrder: item.sortOrder,
        svgKey: item.svgKey,
        priceOptions: incomingPriceOptionsForV4Fingerprint(item.priceOptions),
      }))
      .sort((left, right) =>
        compareProviderText(left.externalProductId, right.externalProductId),
      ),
  });
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
  const mergeCandidates: MenuIdentityMergeCandidate[] = [];
  const canonicalizationCandidates: MenuIdentityCanonicalizationCandidate[] =
    [];
  const mergePreviousIds = new Set<string>();
  const mergeNextIds = new Set<string>();
  if (provider === "aigens") {
    const existingByProduct = new Map<string, ExistingEvidence[]>();
    for (const item of existing) {
      const productIdentity = aigensProductIdentity(
        item.evidence.externalProductId,
      );
      if (!productIdentity) continue;
      existingByProduct.set(productIdentity, [
        ...(existingByProduct.get(productIdentity) ?? []),
        item,
      ]);
    }
    const incomingByProduct = new Map(
      incoming.map((item) => [item.externalProductId, item]),
    );
    for (const [productIdentity, previous] of existingByProduct) {
      const next = incomingByProduct.get(productIdentity);
      const aliases = previous.filter(
        (item) => item.evidence.externalProductId !== productIdentity,
      );
      if (aliases.length === 0) {
        continue;
      }
      if (previous.length === 1) {
        canonicalizationCandidates.push({
          itemId: previous[0].itemId,
          previous: previous[0].evidence,
          nextProductId: productIdentity,
          presentInSnapshot: next !== undefined,
        });
      } else {
        mergeCandidates.push({
          productIdentity,
          previous,
          next: next ?? null,
        });
      }
      previous.forEach((item) =>
        mergePreviousIds.add(item.evidence.externalProductId),
      );
      if (next) mergeNextIds.add(next.externalProductId);
    }
  }
  const previousByName = groupExistingByNormalizedName(
    unmatchedExisting.filter(
      (item) => !mergePreviousIds.has(item.evidence.externalProductId),
    ),
  );
  const nextByName = groupByNormalizedName(
    unmatchedIncoming.filter(
      (item) => !mergeNextIds.has(item.externalProductId),
    ),
  );
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
    snapshotCompleteness: input.snapshotCompleteness,
    scopeEvidence: input.scopeEvidence ?? null,
    summary: {
      existingCount: activeExistingIds.size,
      incomingCount: incoming.length,
      missingIdentityCount: unmatchedExisting.filter((item) =>
        activeExistingIds.has(item.itemId),
      ).length,
      newIdentityCount: unmatchedIncoming.length,
      replacementCandidateCount: replacementCandidates.length,
      canonicalizationCandidateCount: canonicalizationCandidates.length,
      mergeCandidateCount: mergeCandidates.length,
      additionCount: additions.length,
      removalCount: removals.length,
      ambiguityCount: ambiguities.length,
    },
    existingFingerprint,
    incomingFingerprint,
    replacementCandidates,
    canonicalizationCandidates: canonicalizationCandidates.sort((left, right) =>
      compareProviderText(left.nextProductId, right.nextProductId),
    ),
    mergeCandidates: mergeCandidates.sort((left, right) =>
      compareProviderText(left.productIdentity, right.productIdentity),
    ),
    additions,
    removals,
    ambiguities,
  };
}

export function verifyMenuIdentityTransitionArtifact(
  source: MenuIdentityTransitionArtifact["source"],
  existingItems: readonly ExistingSyncMenuItem[],
  input: Pick<
    MenuSyncInput,
    "snapshotCompleteness" | "scopeEvidence" | "items"
  >,
  artifactInput: unknown,
): ApprovedMenuIdentityReplacement[] {
  return verifyMenuIdentityTransitionApproval(
    source,
    existingItems,
    input,
    artifactInput,
  ).replacements;
}

export function verifyMenuIdentityTransitionApproval(
  source: MenuIdentityTransitionArtifact["source"],
  existingItems: readonly ExistingSyncMenuItem[],
  input: Pick<
    MenuSyncInput,
    "snapshotCompleteness" | "scopeEvidence" | "items"
  >,
  artifactInput: unknown,
): ApprovedMenuIdentityTransition {
  const artifact = parseMenuIdentityTransitionArtifact(artifactInput);
  if (artifact.schemaVersion === 4) {
    assertLegacyIdentityTransitionSnapshot(source, input);
  } else {
    assertProviderSnapshotCompleteness(
      source.provider,
      input.snapshotCompleteness,
      input.scopeEvidence,
      source.externalStoreId,
    );
  }
  if (
    artifact.source.provider !== source.provider ||
    artifact.source.externalOwnerId !== source.externalOwnerId ||
    artifact.source.externalStoreId !== source.externalStoreId ||
    artifact.source.configurationFingerprint !== source.configurationFingerprint
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_SOURCE_MISMATCH");
  }
  const currentAudit = buildMenuIdentityTransitionAudit(
    existingItems,
    input,
    source.provider,
  );
  if (
    fingerprint(canonicalJson(currentAudit)) !==
    fingerprint(canonicalJson(artifact.audit))
  ) {
    const scope = currentAudit.scopeEvidence;
    throw new MenuIdentityTransitionStaleError({
      existingMatches:
        currentAudit.existingFingerprint === artifact.audit.existingFingerprint,
      incomingMatches:
        currentAudit.incomingFingerprint === artifact.audit.incomingFingerprint,
      currentSummary: currentAudit.summary,
      currentScope:
        scope?.provider === "aigens"
          ? {
              provider: "aigens",
              categoryCount: scope.categoryCount,
              groupCount: scope.groupCount,
              providerPeriodCount: scope.providerPeriodCodes.length,
              categoryPeriodCount: scope.categoryPeriodCodes.length,
            }
          : scope?.provider === "pinme"
            ? {
                provider: "pinme",
                serviceWindowCount: scope.serviceWindows.length,
              }
            : null,
    } satisfies MenuIdentityTransitionStaleDetails);
  }
  if (artifact.schemaVersion === 5) {
    return verifyIdentityOnlyDecisions(
      source,
      currentAudit,
      artifact.decisions,
    );
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
      ...currentAudit.ambiguities.flatMap((ambiguity) =>
        ambiguity.previous.map((item) => ({
          itemId: item.itemId,
          externalProductId: item.evidence.externalProductId,
        })),
      ),
      ...currentAudit.mergeCandidates.flatMap((candidate) =>
        candidate.previous.map((item) => ({
          itemId: item.itemId,
          externalProductId: item.evidence.externalProductId,
        })),
      ),
      ...currentAudit.canonicalizationCandidates.map((candidate) => ({
        itemId: candidate.itemId,
        externalProductId: candidate.previous.externalProductId,
      })),
    ].map((item) => [item.externalProductId, item]),
  );
  const next = new Set([
    ...currentAudit.replacementCandidates.map(
      (candidate) => candidate.next.externalProductId,
    ),
    ...currentAudit.additions.map((addition) => addition.externalProductId),
    ...currentAudit.ambiguities.flatMap((ambiguity) =>
      ambiguity.next.map((item) => item.externalProductId),
    ),
    ...currentAudit.mergeCandidates.map(
      (candidate) => candidate.productIdentity,
    ),
    ...currentAudit.canonicalizationCandidates.map(
      (candidate) => candidate.nextProductId,
    ),
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
  if (
    !snapshotAbsenceIsEvidence(currentAudit.snapshotCompleteness) ||
    decisions.snapshotScope.status !== "complete"
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_SCOPE_REJECTED");
  }
  const coveredPrevious = new Set<string>();
  const coveredNext = new Set<string>();
  const approvedCanonicalizations: ApprovedMenuIdentityCanonicalization[] = [];
  const canonicalizationDecisions = decisions.canonicalizations;
  for (const canonicalization of canonicalizationDecisions) {
    const candidate = currentAudit.canonicalizationCandidates.find(
      (item) =>
        item.itemId === canonicalization.itemId &&
        item.previous.externalProductId ===
          canonicalization.previousProductId &&
        item.nextProductId === canonicalization.nextProductId,
    );
    if (
      !candidate ||
      !canonicalization.rationale.trim() ||
      coveredPrevious.has(canonicalization.previousProductId) ||
      coveredNext.has(canonicalization.nextProductId)
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
    }
    coveredPrevious.add(canonicalization.previousProductId);
    coveredNext.add(canonicalization.nextProductId);
    approvedCanonicalizations.push({
      itemId: canonicalization.itemId,
      previousProductId: canonicalization.previousProductId,
      nextProductId: canonicalization.nextProductId,
    });
  }
  const approvedMerges: ApprovedMenuIdentityMerge[] = [];
  const mergeDecisions = decisions.merges;
  for (const merge of mergeDecisions) {
    const previousEntries = merge.previousProductIds.map((productId) =>
      previous.get(productId),
    );
    const previousItemIds = previousEntries.flatMap((item) =>
      item ? [item.itemId] : [],
    );
    const expectedItemIds = [merge.survivorItemId, ...merge.mergedItemIds];
    const matchingCandidate = currentAudit.mergeCandidates.some(
      (candidate) =>
        candidate.productIdentity === merge.nextProductId &&
        sameStringSet(
          candidate.previous.map((item) => item.evidence.externalProductId),
          merge.previousProductIds,
        ) &&
        sameStringSet(
          candidate.previous.map((item) => item.itemId),
          expectedItemIds,
        ),
    );
    if (
      source.provider !== "aigens" ||
      !matchingCandidate ||
      previousEntries.some((item) => !item) ||
      !next.has(merge.nextProductId) ||
      !sameStringSet(previousItemIds, expectedItemIds) ||
      merge.mergedItemIds.includes(merge.survivorItemId) ||
      merge.mergedItemIds.length === 0 ||
      merge.duplicateVotePolicy !== "deduplicate-identical" ||
      !merge.rationale.trim() ||
      merge.previousProductIds.some((id) => coveredPrevious.has(id)) ||
      coveredNext.has(merge.nextProductId)
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
    }
    merge.previousProductIds.forEach((id) => coveredPrevious.add(id));
    coveredNext.add(merge.nextProductId);
    approvedMerges.push({
      survivorItemId: merge.survivorItemId,
      mergedItemIds: [...merge.mergedItemIds],
      previousProductIds: [...merge.previousProductIds],
      nextProductId: merge.nextProductId,
      duplicateVotePolicy: merge.duplicateVotePolicy,
    });
  }
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
  return {
    replacements: approvedReplacements.sort((left, right) =>
      compareProviderText(left.nextProductId, right.nextProductId),
    ),
    canonicalizations: approvedCanonicalizations.sort((left, right) =>
      compareProviderText(left.nextProductId, right.nextProductId),
    ),
    merges: approvedMerges.sort((left, right) =>
      compareProviderText(left.nextProductId, right.nextProductId),
    ),
  };
}

function verifyIdentityOnlyDecisions(
  source: MenuIdentityTransitionArtifact["source"],
  audit: MenuIdentityTransitionAudit,
  decisions: MenuIdentityTransitionArtifactV5["decisions"],
): ApprovedMenuIdentityTransition {
  if (audit.ambiguities.length > 0) {
    throw new Error("MENU_IDENTITY_TRANSITION_AMBIGUOUS");
  }

  const coveredPrevious = new Set<string>();
  const coveredNext = new Set<string>();
  const replacements: ApprovedMenuIdentityReplacement[] = [];
  for (const decision of decisions.replacements) {
    const candidate = audit.replacementCandidates.find(
      (item) =>
        item.itemId === decision.itemId &&
        item.previous.externalProductId === decision.previousProductId &&
        item.next.externalProductId === decision.nextProductId,
    );
    if (
      !candidate ||
      !decision.rationale.trim() ||
      coveredPrevious.has(decision.previousProductId) ||
      coveredNext.has(decision.nextProductId)
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
    }
    coveredPrevious.add(decision.previousProductId);
    coveredNext.add(decision.nextProductId);
    replacements.push({
      itemId: decision.itemId,
      previousProductId: decision.previousProductId,
      nextProductId: decision.nextProductId,
    });
  }

  const canonicalizations: ApprovedMenuIdentityCanonicalization[] = [];
  for (const decision of decisions.canonicalizations) {
    const candidate = audit.canonicalizationCandidates.find(
      (item) =>
        item.itemId === decision.itemId &&
        item.previous.externalProductId === decision.previousProductId &&
        item.nextProductId === decision.nextProductId,
    );
    if (
      source.provider !== "aigens" ||
      !candidate ||
      !decision.rationale.trim() ||
      coveredPrevious.has(decision.previousProductId) ||
      coveredNext.has(decision.nextProductId)
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
    }
    coveredPrevious.add(decision.previousProductId);
    coveredNext.add(decision.nextProductId);
    canonicalizations.push({
      itemId: decision.itemId,
      previousProductId: decision.previousProductId,
      nextProductId: decision.nextProductId,
    });
  }

  const merges: ApprovedMenuIdentityMerge[] = [];
  for (const decision of decisions.merges) {
    const itemIds = [decision.survivorItemId, ...decision.mergedItemIds];
    const candidate = audit.mergeCandidates.find(
      (item) =>
        item.productIdentity === decision.nextProductId &&
        sameStringSet(
          item.previous.map((previous) => previous.evidence.externalProductId),
          decision.previousProductIds,
        ) &&
        sameStringSet(
          item.previous.map((previous) => previous.itemId),
          itemIds,
        ),
    );
    if (
      source.provider !== "aigens" ||
      !candidate ||
      decision.mergedItemIds.includes(decision.survivorItemId) ||
      decision.duplicateVotePolicy !== "deduplicate-identical" ||
      !decision.rationale.trim() ||
      decision.previousProductIds.some((id) => coveredPrevious.has(id)) ||
      coveredNext.has(decision.nextProductId)
    ) {
      throw new Error("MENU_IDENTITY_TRANSITION_INVALID_DECISIONS");
    }
    decision.previousProductIds.forEach((id) => coveredPrevious.add(id));
    coveredNext.add(decision.nextProductId);
    merges.push({
      survivorItemId: decision.survivorItemId,
      mergedItemIds: [...decision.mergedItemIds],
      previousProductIds: [...decision.previousProductIds],
      nextProductId: decision.nextProductId,
      duplicateVotePolicy: decision.duplicateVotePolicy,
    });
  }

  const expectedPrevious = new Set([
    ...audit.replacementCandidates.map(
      (candidate) => candidate.previous.externalProductId,
    ),
    ...audit.canonicalizationCandidates.map(
      (candidate) => candidate.previous.externalProductId,
    ),
    ...audit.mergeCandidates.flatMap((candidate) =>
      candidate.previous.map((item) => item.evidence.externalProductId),
    ),
  ]);
  const expectedNext = new Set([
    ...audit.replacementCandidates.map(
      (candidate) => candidate.next.externalProductId,
    ),
    ...audit.canonicalizationCandidates.map(
      (candidate) => candidate.nextProductId,
    ),
    ...audit.mergeCandidates.map((candidate) => candidate.productIdentity),
  ]);
  if (
    !sameStringSet([...coveredPrevious], [...expectedPrevious]) ||
    !sameStringSet([...coveredNext], [...expectedNext])
  ) {
    throw new Error("MENU_IDENTITY_TRANSITION_INCOMPLETE_DECISIONS");
  }

  return {
    replacements: replacements.sort((left, right) =>
      compareProviderText(left.nextProductId, right.nextProductId),
    ),
    canonicalizations: canonicalizations.sort((left, right) =>
      compareProviderText(left.nextProductId, right.nextProductId),
    ),
    merges: merges.sort((left, right) =>
      compareProviderText(left.nextProductId, right.nextProductId),
    ),
  };
}

/**
 * Compatibility boundary for legacy v4 identity-transition snapshots.
 * This does not grant ordinary Aigens observations removal authority.
 */
export function assertLegacyIdentityTransitionSnapshot(
  source: Pick<
    MenuIdentityTransitionArtifact["source"],
    "provider" | "externalStoreId"
  >,
  input: Pick<MenuSyncInput, "snapshotCompleteness" | "scopeEvidence">,
): void {
  if (
    source.provider !== "aigens" ||
    input.snapshotCompleteness !== "complete"
  ) {
    assertProviderSnapshotCompleteness(
      source.provider,
      input.snapshotCompleteness,
      input.scopeEvidence,
      source.externalStoreId,
    );
    return;
  }
  if (!input.scopeEvidence) {
    throw new Error("MENU_SNAPSHOT_SCOPE_EVIDENCE_REQUIRED");
  }
  assertProviderSnapshotScope(
    source.provider,
    input.scopeEvidence,
    source.externalStoreId,
  );
}

export function parseMenuIdentityTransitionArtifact(
  input: unknown,
): MenuIdentityTransitionArtifact {
  const artifact = record(input);
  const source = record(artifact?.source);
  const audit = record(artifact?.audit);
  const decisions = record(artifact?.decisions);
  const schemaVersion = artifact?.schemaVersion;
  const validCommonDecisions = Boolean(
    decisions &&
    Array.isArray(decisions.replacements) &&
    decisions.replacements.every(validReplacementDecision) &&
    Array.isArray(decisions.canonicalizations) &&
    decisions.canonicalizations.every(validCanonicalizationDecision) &&
    Array.isArray(decisions.merges) &&
    decisions.merges.every(validMergeDecision),
  );
  const validVersionDecisions =
    schemaVersion === 5
      ? Boolean(
          decisions &&
          Object.keys(decisions).every((key) =>
            ["replacements", "canonicalizations", "merges"].includes(key),
          ),
        )
      : Boolean(
          schemaVersion === 4 &&
          decisions &&
          validSnapshotScopeDecision(decisions.snapshotScope) &&
          Array.isArray(decisions.additions) &&
          decisions.additions.every(
            (value) => typeof value === "string" && value,
          ) &&
          Array.isArray(decisions.removals) &&
          decisions.removals.every(validRemovalDecision) &&
          Array.isArray(decisions.ambiguities) &&
          decisions.ambiguities.every(validAmbiguityDecision),
        );
  if (
    (schemaVersion !== 4 && schemaVersion !== 5) ||
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
    !MENU_SNAPSHOT_COMPLETENESS.includes(
      audit.snapshotCompleteness as MenuSyncInput["snapshotCompleteness"],
    ) ||
    !validCommonDecisions ||
    !validVersionDecisions
  ) {
    throw new Error("INVALID_MENU_IDENTITY_TRANSITION_ARTIFACT");
  }
  return input as MenuIdentityTransitionArtifact;
}

function validCanonicalizationDecision(value: unknown): boolean {
  const decision = record(value);
  return Boolean(
    decision &&
    validIdentity(decision.itemId) &&
    validIdentity(decision.previousProductId) &&
    validIdentity(decision.nextProductId) &&
    typeof decision.rationale === "string" &&
    Boolean(decision.rationale.trim()) &&
    decision.rationale.length <= 500,
  );
}

function validMergeDecision(value: unknown): boolean {
  const decision = record(value);
  return Boolean(
    decision &&
    validIdentity(decision.survivorItemId) &&
    Array.isArray(decision.mergedItemIds) &&
    decision.mergedItemIds.length > 0 &&
    decision.mergedItemIds.every(validIdentity) &&
    new Set(decision.mergedItemIds).size === decision.mergedItemIds.length &&
    Array.isArray(decision.previousProductIds) &&
    decision.previousProductIds.length > 1 &&
    decision.previousProductIds.every(validIdentity) &&
    new Set(decision.previousProductIds).size ===
      decision.previousProductIds.length &&
    validIdentity(decision.nextProductId) &&
    decision.duplicateVotePolicy === "deduplicate-identical" &&
    typeof decision.rationale === "string" &&
    Boolean(decision.rationale.trim()) &&
    decision.rationale.length <= 500,
  );
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

function aigensProductIdentity(identity: string): string | null {
  try {
    return normalizePublishedProviderIdentity("aigens", identity);
  } catch {
    return null;
  }
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
  return sortedPriceOptions(options).map((option, sortOrder) => ({
    label: option.label,
    amountMinor: option.amountMinor,
    currency: option.currency,
    sortOrder,
  }));
}

function existingPriceOptionsForV4Fingerprint(
  options: readonly MenuItemPriceOptionInput[],
): MenuItemPriceOptionInput[] {
  return sortedPriceOptions(options).map((option, sortOrder) => ({
    amountMinor: option.amountMinor,
    currency: option.currency,
    label: option.label,
    sortOrder,
  }));
}

function incomingPriceOptionsForV4Fingerprint(
  options: readonly MenuItemPriceOptionInput[],
): MenuItemPriceOptionInput[] {
  return canonicalizePriceOptions(options);
}

function sortedPriceOptions(options: readonly MenuItemPriceOptionInput[]) {
  return [...options].sort(
    (left, right) =>
      compareProviderText(left.label ?? "", right.label ?? "") ||
      left.amountMinor - right.amountMinor ||
      compareProviderText(left.currency, right.currency),
  );
}

function scopeEvidenceForFingerprint(evidence: MenuSyncInput["scopeEvidence"]) {
  if (!evidence) return null;
  if (evidence.provider === "pinme") {
    return {
      provider: evidence.provider,
      serviceWindows: [...evidence.serviceWindows].sort(
        (left, right) =>
          compareProviderText(left.startTime, right.startTime) ||
          compareProviderText(left.endTime, right.endTime),
      ),
    };
  }
  return {
    provider: evidence.provider,
    externalStoreId: evidence.externalStoreId,
    storeName: evidence.storeName,
    menuName: evidence.menuName,
    providerPeriodCodes: [...evidence.providerPeriodCodes].sort(
      compareProviderText,
    ),
    categoryPeriodCodes: [...evidence.categoryPeriodCodes].sort(
      compareProviderText,
    ),
    categoryCount: evidence.categoryCount,
    groupCount: evidence.groupCount,
  };
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
