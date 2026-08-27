import type { CanteenMenuSourceProvider } from "@/db/schema";
import {
  canonicalizeProviderMenuIdentityTransitionState,
  canonicalizeProviderMenuState,
  type MenuProvider,
} from "./canteen-provider-menu-identity";
import {
  isSuspiciousMenuIdentityChurn,
  observeMenuIdentityChurn,
  redactMenuDiagnosticSample,
  type MenuIdentityObservation,
  type RedactedMenuSample,
} from "./canteen-menu-sync-observation";
import {
  planMenuSync,
  type ApprovedMenuIdentityReplacement,
  type ExistingSyncMenuItem,
  type MenuSyncPlan,
} from "./canteen-menu-sync";
import {
  materializeMealPeriodActivityProjection,
  projectSingleMenuObservation,
} from "./canteen-menu-projection";
import type {
  CurrentMenuProjection,
  MenuAbsenceAuthority,
  MenuSyncInput,
} from "./canteen-types";
import { normalizeCanonicalDishName } from "./canteen-menu-canonicalization";

export type ResolvedMenuSnapshotSource = {
  id: string;
  provider: CanteenMenuSourceProvider;
  legacyAdoptionOpen: boolean;
};

export type MenuSnapshotBlockingCode =
  | "MENU_SYNC_CONFLICT"
  | "MENU_SYNC_IDENTITY_CHURN"
  | "MENU_SYNC_SUSPICIOUS_DROP";

export type MenuSnapshotBlockingDecision =
  | { blocked: false; code: null; samples: [] }
  | {
      blocked: true;
      code: MenuSnapshotBlockingCode;
      samples: RedactedMenuSample[];
    };

export type MenuSnapshotBlockingReason = {
  code: MenuSnapshotBlockingCode;
  samples: RedactedMenuSample[];
};

type MenuEvaluationInput = MenuSyncInput | CurrentMenuProjection;

export type MenuSnapshotEvaluation<
  TInput extends MenuEvaluationInput = MenuSyncInput,
> = {
  canonicalState: {
    input: TInput;
    existingItems: ExistingSyncMenuItem[];
  };
  plan: MenuSyncPlan;
  identityObservation: MenuIdentityObservation;
  blockingReasons: MenuSnapshotBlockingReason[];
  blockingDecision: MenuSnapshotBlockingDecision;
};

type MenuSnapshotEvaluationOptions = {
  adapterAcceptedEmpty?: boolean;
};

const BLOCKING_SAMPLE_LIMIT = 5;

/** Evaluate one provider snapshot without performing database I/O or mutation. */
export function evaluateMenuSnapshot(
  source: ResolvedMenuSnapshotSource,
  input: MenuSyncInput,
  existingItems: ExistingSyncMenuItem[],
  approvedIdentityReplacements: readonly ApprovedMenuIdentityReplacement[] = [],
  options: MenuSnapshotEvaluationOptions = {},
): MenuSnapshotEvaluation {
  const canonicalState = canonicalizeSourceState(
    source.id,
    source.provider,
    input,
    existingItems,
    options,
  );
  return evaluateCanonicalMenuSnapshot(
    source,
    canonicalState,
    projectSingleMenuObservation(canonicalState.input),
    input.takeOverLegacyItems,
    approvedIdentityReplacements,
  );
}

/** Evaluate one already-materialized current-menu projection. */
export function evaluateCurrentMenuProjection(
  source: ResolvedMenuSnapshotSource,
  projection: CurrentMenuProjection,
  existingItems: ExistingSyncMenuItem[],
  options: MenuSnapshotEvaluationOptions = {},
  acceptedPeriodItems: Parameters<
    typeof materializeMealPeriodActivityProjection
  >[3] = {},
): MenuSnapshotEvaluation<CurrentMenuProjection> {
  const canonicalState = canonicalizeSourceState(
    source.id,
    source.provider,
    projection,
    existingItems,
    options,
  );
  const observedItems = canonicalState.input.items;
  const materialized = materializeMealPeriodActivityProjection(
    source.id,
    canonicalState.input,
    canonicalState.existingItems,
    acceptedPeriodItems,
  );
  return evaluateCanonicalMenuSnapshot(
    source,
    { ...canonicalState, input: materialized },
    materialized,
    false,
    [],
    observedItems,
  );
}

/** Evaluate the exact audited transition while preserving legacy evidence. */
export function evaluateMenuIdentityTransitionSnapshot(
  source: ResolvedMenuSnapshotSource,
  input: MenuSyncInput,
  existingItems: ExistingSyncMenuItem[],
  approvedIdentityReplacements: readonly ApprovedMenuIdentityReplacement[] = [],
): MenuSnapshotEvaluation {
  const orderedExistingItems = [...existingItems].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const managed = orderedExistingItems.filter(
    (item) => item.menuSourceId === source.id,
  );
  const canonicalManaged = canonicalizeProviderMenuIdentityTransitionState(
    source.provider,
    input,
    managed,
  );
  const managedById = new Map(
    canonicalManaged.existingItems.map((item) => [item.id, item]),
  );
  return evaluateCanonicalMenuSnapshot(
    source,
    {
      input: canonicalManaged.input,
      existingItems: orderedExistingItems.map(
        (item) => managedById.get(item.id) ?? item,
      ),
    },
    projectSingleMenuObservation(canonicalManaged.input),
    input.takeOverLegacyItems,
    approvedIdentityReplacements,
  );
}

function evaluateCanonicalMenuSnapshot<TInput extends MenuEvaluationInput>(
  source: ResolvedMenuSnapshotSource,
  canonicalState: MenuSnapshotEvaluation<TInput>["canonicalState"],
  projection: CurrentMenuProjection,
  takeOverLegacyItems: boolean,
  approvedIdentityReplacements: readonly ApprovedMenuIdentityReplacement[],
  observedItems = projection.items,
): MenuSnapshotEvaluation<TInput> {
  const plan = planMenuSync(
    source.id,
    projection,
    canonicalState.existingItems,
    {
      legacyAdoptionOpen: source.legacyAdoptionOpen,
      takeOverLegacyItems,
      approvedIdentityReplacements,
    },
  );
  const coveredMealPeriods =
    projection.absenceAuthority.kind === "current-activity"
      ? new Set(projection.absenceAuthority.coveredMealPeriods)
      : null;
  const incomingIds = new Set(
    observedItems.map((item) => item.externalProductId),
  );
  const resolvedAliases = new Map<
    string,
    { existingIds: Set<string>; incomingIds: string[]; name: string }
  >();
  for (const action of plan.actions) {
    if (!action.itemId || action.action === "deactivate") continue;
    const existing = canonicalState.existingItems.find(
      (item) => item.id === action.itemId,
    );
    if (
      !existing ||
      normalizeCanonicalDishName(existing.name) !== action.normalizedName
    ) {
      continue;
    }
    resolvedAliases.set(action.itemId, {
      existingIds: new Set(
        existing.externalProductIds ??
          (existing.externalProductId ? [existing.externalProductId] : []),
      ),
      incomingIds: action.externalProductIds,
      name: action.name,
    });
  }
  const managedIdentityProjection = canonicalState.existingItems.flatMap(
    (item) => {
      if (item.menuSourceId !== source.id) return [];
      const productIds =
        item.externalProductIds ??
        (item.externalProductId === null ? [] : [item.externalProductId]);
      const activeProductIds = new Set(
        item.activeExternalProductIds ?? (item.isAvailable ? productIds : []),
      );
      return productIds.map((externalProductId) => ({
        externalProductId,
        name: item.name,
        isAvailable:
          activeProductIds.has(externalProductId) &&
          (!coveredMealPeriods ||
            item.mealPeriods.includes("allday") ||
            item.mealPeriods.some(
              (period) => period !== "allday" && coveredMealPeriods.has(period),
            )),
      }));
    },
  );
  const identityObservation = observeMenuIdentityChurn(
    managedIdentityProjection,
    observedItems,
  );
  const resolvedMissingIds = new Set(
    [...resolvedAliases.values()].flatMap((alias) =>
      [...alias.existingIds].filter((productId) => !incomingIds.has(productId)),
    ),
  );
  const blockingIdentityProjection = managedIdentityProjection.map((item) => ({
    ...item,
    isAvailable:
      item.isAvailable && !resolvedMissingIds.has(item.externalProductId),
  }));
  const knownProjectedIds = new Set(
    blockingIdentityProjection.map((item) => item.externalProductId),
  );
  for (const alias of resolvedAliases.values()) {
    for (const externalProductId of alias.incomingIds) {
      if (knownProjectedIds.has(externalProductId)) continue;
      blockingIdentityProjection.push({
        externalProductId,
        name: alias.name,
        isAvailable: true,
      });
    }
  }
  const activeManagedCount = managedIdentityProjection.filter(
    (item) => item.isAvailable,
  ).length;
  const blockingIdentityObservation = observeMenuIdentityChurn(
    blockingIdentityProjection,
    observedItems,
  );
  const blockingReasons = collectMenuSnapshotBlockingReasons(
    plan,
    blockingIdentityObservation,
    activeManagedCount,
    observedItems.length,
    projection.absenceAuthority,
    projection.confirmedEmpty === true,
  );

  return {
    canonicalState,
    plan,
    identityObservation,
    blockingReasons,
    blockingDecision: blockingDecisionFor(blockingReasons),
  };
}

function collectMenuSnapshotBlockingReasons(
  plan: MenuSyncPlan,
  observation: MenuIdentityObservation,
  activeManagedCount: number,
  incomingItemCount: number,
  absenceAuthority: MenuAbsenceAuthority,
  confirmedEmpty: boolean,
): MenuSnapshotBlockingReason[] {
  const reasons: MenuSnapshotBlockingReason[] = [];
  if (plan.conflicts.length > 0) {
    const unsafeSamples = plan.conflicts.flatMap((conflict) => [
      conflict.externalProductId,
      ...conflict.candidateIds,
    ]);
    reasons.push(reasonWithRawSamples("MENU_SYNC_CONFLICT", unsafeSamples));
  }
  if (
    !confirmedEmpty &&
    activeManagedCount > 0 &&
    isSuspiciousMenuIdentityChurn(
      observation,
      activeManagedCount,
      absenceAuthority,
    )
  ) {
    reasons.push(
      reason("MENU_SYNC_IDENTITY_CHURN", [
        ...observation.newProductSamples,
        ...observation.missingProductSamples,
        ...observation.suspectedReplacementSamples.flatMap((replacement) => [
          replacement.previousProductId,
          replacement.nextProductId,
        ]),
      ]),
    );
  }
  const deactivationCount = plan.actions.filter(
    (action) => action.action === "deactivate",
  ).length;
  if (
    !confirmedEmpty &&
    absenceAuthority.kind !== "current-activity" &&
    activeManagedCount > 0 &&
    deactivationCount > 0 &&
    incomingItemCount * 2 <= activeManagedCount
  ) {
    reasons.push(
      reason("MENU_SYNC_SUSPICIOUS_DROP", observation.missingProductSamples),
    );
  }
  return reasons;
}

function reasonWithRawSamples(
  code: MenuSnapshotBlockingCode,
  unsafeSamples: readonly string[],
): MenuSnapshotBlockingReason {
  return reason(code, unsafeSamples.map(redactMenuDiagnosticSample));
}

function reason(
  code: MenuSnapshotBlockingCode,
  samples: readonly RedactedMenuSample[],
): MenuSnapshotBlockingReason {
  return {
    code,
    samples: [...new Set(samples)].slice(0, BLOCKING_SAMPLE_LIMIT),
  };
}

export function blockingDecisionFor(
  reasons: readonly MenuSnapshotBlockingReason[],
): MenuSnapshotBlockingDecision {
  const primary = reasons[0];
  return primary
    ? { blocked: true, code: primary.code, samples: primary.samples }
    : { blocked: false, code: null, samples: [] };
}

export function resolveApprovedIdentityTransitionBlocking(
  evaluation: MenuSnapshotEvaluation,
): MenuSnapshotEvaluation {
  const blockingReasons = evaluation.blockingReasons.filter(
    (reason) =>
      reason.code !== "MENU_SYNC_IDENTITY_CHURN" &&
      reason.code !== "MENU_SYNC_SUSPICIOUS_DROP",
  );
  return {
    ...evaluation,
    blockingReasons,
    blockingDecision: blockingDecisionFor(blockingReasons),
  };
}

function canonicalizeSourceState<TInput extends MenuEvaluationInput>(
  sourceId: string,
  provider: MenuProvider,
  input: TInput,
  existingItems: ExistingSyncMenuItem[],
  options: MenuSnapshotEvaluationOptions,
): MenuSnapshotEvaluation<TInput>["canonicalState"] {
  const orderedExistingItems = [...existingItems].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const managed = orderedExistingItems.filter(
    (item) => item.menuSourceId === sourceId,
  );
  const canonicalManaged = canonicalizeProviderMenuState(
    provider,
    input,
    managed,
    { allowEmptySnapshot: options.adapterAcceptedEmpty },
  );
  const managedById = new Map(
    canonicalManaged.existingItems.map((item) => [item.id, item]),
  );
  return {
    input: canonicalManaged.input,
    existingItems: orderedExistingItems.map(
      (item) => managedById.get(item.id) ?? item,
    ),
  };
}
