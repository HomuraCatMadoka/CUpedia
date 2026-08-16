import type { CanteenMenuSourceProvider } from "@/db/schema";

export const MENU_SNAPSHOT_COMPLETENESS = ["complete", "partial"] as const;
export type MenuSnapshotCompleteness =
  (typeof MENU_SNAPSHOT_COMPLETENESS)[number];

const PROVIDER_SNAPSHOT_COMPLETENESS = {
  aigens: "complete",
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
  return PROVIDER_SNAPSHOT_COMPLETENESS[provider];
}

export function assertProviderSnapshotCompleteness(
  provider: CanteenMenuSourceProvider,
  actual: MenuSnapshotCompleteness,
): void {
  if (actual !== expectedMenuSnapshotCompleteness(provider)) {
    throw new Error("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
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
