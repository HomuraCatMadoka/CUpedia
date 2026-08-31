import { createHash } from "node:crypto";

import type { CampusMapPublishSourceInput } from "@/lib/campus-map/publish-contract";

export interface CampusMapLifecycleOperationIdentity {
  idempotencyKey: string;
  sourceAccessedOn: string;
  reason: string;
}

export function createCampusMapLifecycleSource(
  input: CampusMapLifecycleOperationIdentity,
  actorId: string,
): CampusMapPublishSourceInput {
  return {
    kind: "other",
    // The public provenance identity is stable per actor and retry without
    // persisting the private idempotency key itself.
    ref: `campus-map-admin-lifecycle:${lifecycleSourceIdentity(
      actorId,
      input.idempotencyKey,
    )}`,
    url: null,
    owner: "CUpedia administrators",
    version: null,
    snapshotHash: null,
    // The caller creates this alongside the idempotency key. Reusing both
    // values keeps a retry byte-for-byte stable across a Hong Kong date change.
    // The publish seam still validates the date before writing.
    accessedOn: input.sourceAccessedOn,
    observedAt: null,
    rightsStatus: "unknown",
    limitations: "Administrative lifecycle decision; not location evidence.",
    note: input.reason,
    sourceCoordinate: null,
  };
}

function lifecycleSourceIdentity(actorId: string, idempotencyKey: string) {
  return createHash("sha256")
    .update(actorId)
    .update("\0")
    .update(idempotencyKey)
    .digest("hex");
}
