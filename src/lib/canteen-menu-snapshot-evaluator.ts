import type { CanteenMenuSourceProvider } from "@/db/schema";
import {
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

export type MenuSnapshotEvaluation = {
  canonicalState: {
    input: MenuSyncInput;
    existingItems: ExistingSyncMenuItem[];
  };
  plan: MenuSyncPlan;
  identityObservation: MenuIdentityObservation;
  blockingDecision: MenuSnapshotBlockingDecision;
};

const BLOCKING_SAMPLE_LIMIT = 5;

/** Evaluate one provider snapshot without performing database I/O or mutation. */
export function evaluateMenuSnapshot(
  source: ResolvedMenuSnapshotSource,
  input: MenuSyncInput,
  existingItems: ExistingSyncMenuItem[],
): MenuSnapshotEvaluation {
  const canonicalState = canonicalizeSourceProjection(
    source.id,
    source.provider,
    input,
    existingItems,
  );
  const plan = planMenuSync(
    source.id,
    canonicalState.input,
    canonicalState.existingItems,
    source.legacyAdoptionOpen,
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
  const blockingDecision = decideMenuSnapshotBlocking(
    plan,
    identityObservation,
    activeManagedCount,
    canonicalState.input.items.length,
  );

  return {
    canonicalState,
    plan,
    identityObservation,
    blockingDecision,
  };
}

function decideMenuSnapshotBlocking(
  plan: MenuSyncPlan,
  observation: MenuIdentityObservation,
  activeManagedCount: number,
  incomingItemCount: number,
): MenuSnapshotBlockingDecision {
  if (plan.conflicts.length > 0) {
    const unsafeSamples = plan.conflicts.flatMap((conflict) => [
      conflict.externalProductId,
      ...conflict.candidateIds,
    ]);
    return blockedWithRawSamples("MENU_SYNC_CONFLICT", unsafeSamples);
  }
  if (
    activeManagedCount > 0 &&
    isSuspiciousMenuIdentityChurn(observation, activeManagedCount)
  ) {
    return blocked("MENU_SYNC_IDENTITY_CHURN", [
      ...observation.newProductSamples,
      ...observation.missingProductSamples,
      ...observation.suspectedReplacementSamples.flatMap((replacement) => [
        replacement.previousProductId,
        replacement.nextProductId,
      ]),
      ...observation.ambiguousOfferingTransitionSamples,
    ]);
  }
  const deactivationCount = plan.actions.filter(
    (action) => action.action === "deactivate",
  ).length;
  if (
    activeManagedCount > 0 &&
    deactivationCount > 0 &&
    incomingItemCount * 2 <= activeManagedCount
  ) {
    return blocked(
      "MENU_SYNC_SUSPICIOUS_DROP",
      observation.missingProductSamples,
    );
  }
  return { blocked: false, code: null, samples: [] };
}

function blockedWithRawSamples(
  code: MenuSnapshotBlockingCode,
  unsafeSamples: readonly string[],
): MenuSnapshotBlockingDecision {
  return blocked(code, unsafeSamples.map(redactMenuDiagnosticSample));
}

function blocked(
  code: MenuSnapshotBlockingCode,
  samples: readonly RedactedMenuSample[],
): MenuSnapshotBlockingDecision {
  return {
    blocked: true,
    code,
    samples: [...new Set(samples)].slice(0, BLOCKING_SAMPLE_LIMIT),
  };
}

function canonicalizeSourceProjection(
  sourceId: string,
  provider: MenuProvider,
  input: MenuSyncInput,
  existingItems: ExistingSyncMenuItem[],
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
