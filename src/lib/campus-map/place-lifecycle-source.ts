import { createHash } from "node:crypto";

import type { CampusMapPublishSourceInput } from "@/lib/campus-map/publish-contract";

export interface CampusMapLifecycleOperationIdentity {
  idempotencyKey: string;
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
    // This audit date belongs to the trusted publish transaction. The raw
    // request fingerprint excludes it, so a completed retry replays the first
    // committed result even when Hong Kong's calendar date has changed.
    accessedOn: hongKongCalendarDate(new Date()),
    observedAt: null,
    rightsStatus: "unknown",
    limitations: "Administrative lifecycle decision; not location evidence.",
    note: input.reason,
    sourceCoordinate: null,
  };
}

function hongKongCalendarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Hong Kong calendar date could not be formatted");
  }
  return `${year}-${month}-${day}`;
}

function lifecycleSourceIdentity(actorId: string, idempotencyKey: string) {
  return createHash("sha256")
    .update(actorId)
    .update("\0")
    .update(idempotencyKey)
    .digest("hex");
}
