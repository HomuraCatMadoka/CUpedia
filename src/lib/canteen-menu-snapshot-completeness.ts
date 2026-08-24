import type { CanteenMenuSourceProvider } from "@/db/schema";
import type { MenuSnapshotScopeEvidence } from "./canteen-types";

export const MENU_SNAPSHOT_COMPLETENESS = ["complete", "partial"] as const;
export type MenuSnapshotCompleteness =
  (typeof MENU_SNAPSHOT_COMPLETENESS)[number];

const PROVIDER_DEFAULT_SNAPSHOT_COMPLETENESS = {
  aigens: "partial",
  ichef: "complete",
  pinme: "partial",
  qmai: "complete",
} as const satisfies Record<
  CanteenMenuSourceProvider,
  MenuSnapshotCompleteness
>;

export function expectedMenuSnapshotCompleteness(
  provider: CanteenMenuSourceProvider,
): MenuSnapshotCompleteness {
  return PROVIDER_DEFAULT_SNAPSHOT_COMPLETENESS[provider];
}

export function assertProviderSnapshotCompleteness(
  provider: CanteenMenuSourceProvider,
  actual: MenuSnapshotCompleteness,
  scopeEvidence?: MenuSnapshotScopeEvidence,
  externalStoreId?: string,
): void {
  if (actual !== expectedMenuSnapshotCompleteness(provider)) {
    throw new Error("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
  }
  if (scopeEvidence) {
    assertProviderSnapshotScope(provider, scopeEvidence, externalStoreId);
  }
}

export function assertProviderSnapshotScope(
  provider: CanteenMenuSourceProvider,
  scopeEvidence: MenuSnapshotScopeEvidence,
  externalStoreId?: string,
): void {
  if (provider === "pinme" && scopeEvidence.provider === "pinme") return;
  if (
    provider !== "aigens" ||
    scopeEvidence.provider !== "aigens" ||
    scopeEvidence.externalStoreId !== externalStoreId
  ) {
    throw new Error("MENU_SNAPSHOT_SCOPE_EVIDENCE_MISMATCH");
  }
}

export function parseMenuSnapshotCompleteness(
  input: unknown,
): MenuSnapshotCompleteness {
  if (
    typeof input !== "string" ||
    !MENU_SNAPSHOT_COMPLETENESS.includes(input as MenuSnapshotCompleteness)
  ) {
    throw new Error("INVALID_MENU_SNAPSHOT_COMPLETENESS");
  }
  return input as MenuSnapshotCompleteness;
}

export function snapshotAbsenceIsEvidence(
  completeness: MenuSnapshotCompleteness,
): boolean {
  return completeness === "complete";
}

/** Selects stable provider context while excluding result-dependent counts. */
export function menuSnapshotComparisonContext(
  evidence: Record<string, unknown>,
): Record<string, unknown> {
  if (evidence.provider === "aigens") {
    return {
      provider: evidence.provider,
      externalStoreId: evidence.externalStoreId,
      menuName: evidence.menuName,
      providerPeriodCodes: evidence.providerPeriodCodes,
      categoryPeriodCodes: evidence.categoryPeriodCodes,
    };
  }
  if (evidence.provider === "pinme") {
    return {
      provider: evidence.provider,
      referencedGroupIds: evidence.referencedGroupIds,
      serviceWindows: evidence.serviceWindows,
    };
  }
  return evidence;
}
