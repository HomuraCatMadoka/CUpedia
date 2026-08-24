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
import type { MenuSyncInput } from "./canteen-types";

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

export type MenuSnapshotEvaluation = {
  canonicalState: {
    input: MenuSyncInput;
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
  const canonicalState = canonicalizeSourceProjection(
    source.id,
    source.provider,
    input,
    existingItems,
    options,
  );
  return evaluateCanonicalMenuSnapshot(
    source,
    canonicalState,
    approvedIdentityReplacements,
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
    approvedIdentityReplacements,
  );
}

function evaluateCanonicalMenuSnapshot(
  source: ResolvedMenuSnapshotSource,
  canonicalState: MenuSnapshotEvaluation["canonicalState"],
  approvedIdentityReplacements: readonly ApprovedMenuIdentityReplacement[],
): MenuSnapshotEvaluation {
  const plan = planMenuSync(
    source.id,
    canonicalState.input,
    canonicalState.existingItems,
    source.legacyAdoptionOpen,
    approvedIdentityReplacements,
  );
  const managedIdentityProjection = canonicalState.existingItems.flatMap(
    (item) =>
      item.menuSourceId === source.id && item.externalProductId !== null
        ? [
            {
              externalProductId: item.externalProductId,
              name: item.name,
              isAvailable: item.isAvailable,
            },
          ]
        : [],
  );
  const activeManagedCount = managedIdentityProjection.filter(
    (item) => item.isAvailable,
  ).length;
  const identityObservation = observeMenuIdentityChurn(
    managedIdentityProjection,
    canonicalState.input.items,
  );
  const blockingReasons = collectMenuSnapshotBlockingReasons(
    plan,
    identityObservation,
    activeManagedCount,
    canonicalState.input.items.length,
    canonicalState.input.snapshotCompleteness,
    canonicalState.input.activityProjectionAuthority ===
      "all-configured-meal-periods",
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
  snapshotCompleteness: MenuSyncInput["snapshotCompleteness"],
  authoritativeActivityProjection: boolean,
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
    activeManagedCount > 0 &&
    isSuspiciousMenuIdentityChurn(
      observation,
      activeManagedCount,
      snapshotCompleteness,
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
    !authoritativeActivityProjection &&
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

function canonicalizeSourceProjection(
  sourceId: string,
  provider: MenuProvider,
  input: MenuSyncInput,
  existingItems: ExistingSyncMenuItem[],
  options: MenuSnapshotEvaluationOptions,
): MenuSnapshotEvaluation["canonicalState"] {
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
