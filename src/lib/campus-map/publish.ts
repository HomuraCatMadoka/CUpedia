import { createHash, createHmac, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  campusMapBuildings,
  campusMapCurrentFacts,
  campusMapFactRevisions,
  campusMapFloors,
  campusMapPlacePhotoAssets,
  campusMapProvenanceSources,
  campusMapPublishRequests,
  campusMapRevisionPhotos,
  campusMapRevisionProvenance,
  campusMapRevisionVisibility,
  CAMPUS_MAP_CAPABILITIES,
  CAMPUS_MAP_ACTIVE_FACT_SCHEMA_VERSION,
  CAMPUS_MAP_FACT_DISPLAY_METADATA_V2,
  CAMPUS_MAP_WEEKDAYS,
  type CampusMapFactDisplayMetadata,
  type CampusMapFieldDiff,
  type CampusMapPlacePhotoRole,
} from "@/db/schema";
import { accounts, users } from "@/db/schema";
import {
  CampusMapFactStoreTransaction,
  CampusMapProvenanceIdentityConflictError,
  type CampusMapAppendFact,
  type CampusMapLockedRevisionSnapshot,
  type CampusMapAppendPlaceChange,
} from "@/lib/campus-map/fact-store-transaction";
import type {
  CampusMapFactGovernanceCommand,
  CampusMapMergeFieldResolution,
} from "@/lib/campus-map/fact-governance-contract";
import {
  analyzeSourceIdentities,
  hasPublishCommandStructure,
  invalidCommandResult,
  isPublishCommandTooLarge,
  isValidPublishIdempotencyKey,
  normalizePublishCommandIdentifiers,
  sourceIdentity,
  sourceRefMismatch,
  toAppendFact,
  toAppendProvenanceSource,
  validateChangeIdentities,
  validateChangesetMetadata,
  validateComment,
  validateFact,
  validateSource,
} from "@/lib/campus-map/publish-command";
import { canonicalizeCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import type {
  CampusMapPublishChange,
  CampusMapPublishCommand,
  CampusMapPublishContext,
  CampusMapPublishFactInput,
  CampusMapPublishResult,
  CampusMapPublishSafeSnapshot,
  CampusMapPublishSourceInput,
  CampusMapPublishValidationIssue,
  CampusMapPublishWarning,
} from "@/lib/campus-map/publish-contract";
import { consumePublishRate } from "@/lib/campus-map/publish-rate-policy";
import { findActiveCampusMapContributorBlock } from "@/lib/campus-map/moderation-governance";
import { toCampusMapRepublishableFact } from "@/lib/campus-map/place-fact-conversion";
import { createCampusMapLifecycleSource } from "@/lib/campus-map/place-lifecycle-source";
import type { CampusMapPublishReconciliation } from "@/lib/campus-map/publish-receipt-consumer";

export type {
  CampusMapPublishChange,
  CampusMapPublishCommand,
  CampusMapPublishContext,
  CampusMapPublishFactInput,
  CampusMapPublishIssueAnchor,
  CampusMapPublishResult,
  CampusMapPublishSafeSnapshot,
  CampusMapPublishSourceInput,
  CampusMapPublishValidationIssue,
  CampusMapPublishWarning,
} from "@/lib/campus-map/publish-contract";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type StoredPublishRequest = {
  requestFingerprint: string;
  status: string;
  result: Extract<CampusMapPublishResult, { status: "published" }> | null;
};
type CampusMapPublishDiffField = Exclude<
  keyof CampusMapPublishFactInput,
  "buildingId" | "floorId"
>;

const CAMPUS_MAP_PUBLISH_FIELD_METADATA_V2: CampusMapFactDisplayMetadata = {
  ...CAMPUS_MAP_FACT_DISPLAY_METADATA_V2,
  observedAt: { label: "观察时间" },
} satisfies CampusMapFactDisplayMetadata;

type PreparedCampusMapPlacePhotos = Array<{
  assetId: string;
  role: CampusMapPlacePhotoRole;
}>;

function sameCampusMapPlacePhotos(
  left: PreparedCampusMapPlacePhotos,
  right: PreparedCampusMapPlacePhotos,
) {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.assetId === right[index]?.assetId &&
        item.role === right[index]?.role,
    )
  );
}

function campusMapPlacePhotoDiff(
  before: PreparedCampusMapPlacePhotos,
  after: PreparedCampusMapPlacePhotos,
): CampusMapFieldDiff {
  if (sameCampusMapPlacePhotos(before, after)) return {};
  const count = (items: PreparedCampusMapPlacePhotos) => `${items.length} 张`;
  return {
    photos: {
      before: count(before),
      after:
        before.length === after.length
          ? `${count(after)}（内容或顺序已更新）`
          : count(after),
      label: "地点照片",
    },
  };
}

/**
 * Reads revision-bound Place photos through the caller's transaction so
 * conflict snapshots and publish validation see the same locked database
 * state. Keep the ordering/grouping rule here rather than duplicating it at
 * each publish call site.
 */
async function loadCampusMapRevisionPhotos(
  transaction: DatabaseTransaction,
  revisionIds: readonly string[],
): Promise<Map<string, PreparedCampusMapPlacePhotos>> {
  const ids = [...new Set(revisionIds)];
  if (ids.length === 0) return new Map();

  const rows = await transaction
    .select({
      revisionId: campusMapRevisionPhotos.revisionId,
      assetId: campusMapRevisionPhotos.assetId,
      role: campusMapRevisionPhotos.role,
      sortOrder: campusMapRevisionPhotos.sortOrder,
    })
    .from(campusMapRevisionPhotos)
    .where(inArray(campusMapRevisionPhotos.revisionId, ids))
    .orderBy(
      campusMapRevisionPhotos.revisionId,
      campusMapRevisionPhotos.sortOrder,
    );

  const photosByRevision = new Map<string, PreparedCampusMapPlacePhotos>();
  for (const row of rows) {
    const photos = photosByRevision.get(row.revisionId);
    const photo = { assetId: row.assetId, role: row.role };
    if (photos) photos.push(photo);
    else photosByRevision.set(row.revisionId, [photo]);
  }
  return photosByRevision;
}

function supportsPreciseLocationEvidence(source: {
  kind: CampusMapPublishSourceInput["kind"];
  rightsStatus: CampusMapPublishSourceInput["rightsStatus"];
  hasSourceCoordinate: boolean;
}) {
  return (
    (source.kind === "field-observation" &&
      source.rightsStatus === "original-observation") ||
    ((source.kind === "official" || source.kind === "open-data") &&
      source.hasSourceCoordinate &&
      (source.rightsStatus === "public-domain" ||
        source.rightsStatus === "permission-granted"))
  );
}

/**
 * Returns only the locked revision sources that can justify a precise point.
 * A later revision may reuse these IDs when that exact location assertion is
 * carried forward, without inheriting every historical source indefinitely.
 */
async function loadPreciseLocationEvidenceIds(
  transaction: DatabaseTransaction,
  revisionIds: readonly string[],
): Promise<Map<string, string[]>> {
  const ids = [...new Set(revisionIds)];
  if (ids.length === 0) return new Map();

  const rows = await transaction
    .select({
      revisionId: campusMapRevisionProvenance.revisionId,
      provenanceId: campusMapRevisionProvenance.provenanceId,
      kind: campusMapProvenanceSources.sourceKind,
      rightsStatus: campusMapProvenanceSources.rightsStatus,
      sourceCoordinateX: campusMapProvenanceSources.sourceCoordinateX,
      sourceCoordinateY: campusMapProvenanceSources.sourceCoordinateY,
    })
    .from(campusMapRevisionProvenance)
    .innerJoin(
      campusMapProvenanceSources,
      eq(
        campusMapProvenanceSources.id,
        campusMapRevisionProvenance.provenanceId,
      ),
    )
    .where(inArray(campusMapRevisionProvenance.revisionId, ids))
    .orderBy(
      campusMapRevisionProvenance.revisionId,
      campusMapRevisionProvenance.provenanceId,
    );

  const evidenceIdsByRevision = new Map<string, string[]>();
  for (const row of rows) {
    if (
      !supportsPreciseLocationEvidence({
        kind: row.kind,
        rightsStatus: row.rightsStatus,
        hasSourceCoordinate:
          row.sourceCoordinateX !== null && row.sourceCoordinateY !== null,
      })
    ) {
      continue;
    }
    const evidenceIds = evidenceIdsByRevision.get(row.revisionId);
    if (evidenceIds) evidenceIds.push(row.provenanceId);
    else evidenceIdsByRevision.set(row.revisionId, [row.provenanceId]);
  }
  return evidenceIdsByRevision;
}

/**
 * Sole application seam for publishing Campus Map facts. The command contains
 * intent only; authenticated actor identity and client IP come from trusted
 * server context and are revalidated with all mutable state in PostgreSQL.
 */
export async function publishCampusMapChangeset(
  command: CampusMapPublishCommand,
  context: CampusMapPublishContext,
): Promise<CampusMapPublishResult> {
  return publishCampusMapChangesetInternal(command, context, {
    allowMerge: false,
    requireAdmin: false,
    revertsChangesetId: null,
    noOpUpdatePlaceIds: new Set(),
    retireFactPlaceIds: new Set(),
  });
}

/** Reads the private #718 idempotency record without starting a new publish. */
export async function reconcileCampusMapPublishReceipt(
  command: CampusMapPublishCommand,
  actorId: string | null,
): Promise<CampusMapPublishReconciliation> {
  if (!actorId) return { status: "authentication-required" };
  if (
    !hasPublishCommandStructure(command) ||
    !isValidPublishIdempotencyKey(command.idempotencyKey)
  ) {
    return { status: "not-committed" };
  }
  const serializedCommand = serializePublishCommandIdentity(command);
  if (serializedCommand === null) {
    return { status: "identity-mismatch" };
  }
  const requestFingerprint = fingerprintRequest(serializedCommand);
  const [request] = await db
    .select({
      requestFingerprint: campusMapPublishRequests.requestFingerprint,
      status: campusMapPublishRequests.status,
      result: campusMapPublishRequests.result,
    })
    .from(campusMapPublishRequests)
    .where(
      and(
        eq(campusMapPublishRequests.actorIdSnapshot, actorId),
        eq(campusMapPublishRequests.idempotencyKey, command.idempotencyKey),
      ),
    )
    .limit(1);
  if (!request) return { status: "not-committed" };
  if (request.requestFingerprint !== requestFingerprint) {
    return { status: "identity-mismatch" };
  }
  if (request.status === "published" && request.result !== null) {
    return { status: "committed", receipt: request.result };
  }
  return { status: "unavailable" };
}

const CAMPUS_MAP_MERGE_FACT_FIELDS = [
  "name",
  "buildingId",
  "floorId",
  "placeType",
  "regularHours",
  "officialActions",
  "visitNote",
  "capabilities",
  "gender",
  "wheelchairAccess",
  "location",
  "observedAt",
] as const satisfies readonly (keyof CampusMapPublishFactInput)[];
type MissingMergeFactField = Exclude<
  keyof CampusMapPublishFactInput,
  (typeof CAMPUS_MAP_MERGE_FACT_FIELDS)[number]
>;
const MERGE_FACT_FIELDS_ARE_EXHAUSTIVE: MissingMergeFactField extends never
  ? true
  : never = true;
void MERGE_FACT_FIELDS_ARE_EXHAUSTIVE;

/** Typed, server-authorized fact-governance facade over the sole publisher. */
export async function governCampusMapFacts(
  rawCommand: CampusMapFactGovernanceCommand,
  context: CampusMapPublishContext,
): Promise<CampusMapPublishResult> {
  const command = normalizeGovernanceCommandIdentifiers(rawCommand);
  if (command.kind === "bulk-edit") {
    return publishCampusMapChangeset(
      {
        kind: "bulk",
        idempotencyKey: command.idempotencyKey,
        comment: command.reason,
        sourceSummary: command.sourceSummary,
        reviewRequested: false,
        client: command.client,
        warningAcknowledgements: command.warningAcknowledgements,
        changes: command.changes,
      },
      context,
    );
  }

  if (command.kind === "revert") {
    return publishCampusMapGovernanceIntent(command, context, (store) =>
      prepareCampusMapRevert(command, store),
    );
  }
  if (command.kind === "merge") {
    return publishCampusMapGovernanceIntent(
      command,
      context,
      (store, actorId) => prepareCampusMapMerge(command, store, actorId),
    );
  }
  return publishCampusMapGovernanceIntent(command, context, (store, actorId) =>
    prepareCampusMapLifecycle(command, store, actorId),
  );
}

async function prepareCampusMapLifecycle(
  command: Extract<
    CampusMapFactGovernanceCommand,
    { kind: "retire" | "restore" }
  >,
  store: CampusMapFactStoreTransaction,
  actorId: string,
): Promise<PreparedCampusMapGovernancePublish | CampusMapPublishResult> {
  const lifecycleSource = createCampusMapLifecycleSource(command, actorId);
  let change: CampusMapPublishChange;
  if (command.kind === "restore") {
    const [base] = await store.lockGovernanceRevisionSnapshots([
      { placeId: command.placeId, revisionId: command.baseRevisionId },
    ]);
    const converted =
      base?.visibility === "public"
        ? toCampusMapRepublishableFact({
            kind: "stored",
            factSchemaVersion: base.factSchemaVersion,
            fact: base.fact,
          })
        : null;
    if (!converted?.ok) return lifecycleSnapshotUnavailable(command.placeId);
    change = {
      operation: "restore",
      placeId: command.placeId,
      baseRevisionId: command.baseRevisionId,
      fact: converted.fact,
      sources: [lifecycleSource],
    };
  } else {
    change = {
      operation: "retire",
      placeId: command.placeId,
      baseRevisionId: command.baseRevisionId,
      sources: [lifecycleSource],
    };
  }
  return {
    command: {
      kind: "single",
      idempotencyKey: command.idempotencyKey,
      comment: command.reason,
      sourceSummary: "管理员地点生命周期操作",
      reviewRequested: false,
      client: command.client,
      warningAcknowledgements: [],
      changes: [change],
    },
    revertsChangesetId: null,
  };
}

async function prepareCampusMapRevert(
  command: Extract<CampusMapFactGovernanceCommand, { kind: "revert" }>,
  store: CampusMapFactStoreTransaction,
): Promise<PreparedCampusMapGovernancePublish | CampusMapPublishResult> {
  const [target, base] = await store.lockGovernanceRevisionSnapshots([
    { placeId: command.placeId, revisionId: command.targetRevisionId },
    { placeId: command.placeId, revisionId: command.baseRevisionId },
  ]);
  if (!target || !base) {
    return governanceValidationFailure("revision-not-found");
  }
  if (target.visibility !== "public" || base.visibility !== "public") {
    return governanceValidationFailure("redacted-revision-not-revertible");
  }
  if (target.status === "merged" || base.status === "merged") {
    return governanceValidationFailure("merged-place-not-revertible");
  }
  const operation =
    target.status === "retired"
      ? base.status === "active"
        ? "retire"
        : null
      : base.status === "retired"
        ? "restore"
        : "update";
  if (operation === null) {
    return governanceValidationFailure("revision-status-not-revertible");
  }
  const convertedTarget = toCampusMapRepublishableFact({
    kind: "stored",
    factSchemaVersion: target.factSchemaVersion,
    fact: target.fact,
  });
  if (!convertedTarget.ok) {
    return governanceValidationFailure("revision-fact-unavailable");
  }
  const publishCommand: CampusMapPublishCommand = {
    kind: "single",
    idempotencyKey: command.idempotencyKey,
    comment: command.reason,
    sourceSummary: `Revert revision ${command.targetRevisionId}`,
    reviewRequested: false,
    client: command.client,
    warningAcknowledgements: [],
    changes: [
      {
        operation,
        placeId: command.placeId,
        baseRevisionId: command.baseRevisionId,
        fact: convertedTarget.fact,
        sources: command.sources,
      },
    ],
  };
  return {
    command: publishCommand,
    revertsChangesetId: target.changesetId,
    retireFactPlaceIds:
      operation === "retire" ? new Set([command.placeId]) : undefined,
  };
}

async function prepareCampusMapMerge(
  command: Extract<CampusMapFactGovernanceCommand, { kind: "merge" }>,
  store: CampusMapFactStoreTransaction,
  actorId: string,
): Promise<PreparedCampusMapGovernancePublish | CampusMapPublishResult> {
  if (command.survivor.placeId === command.loser.placeId) {
    return governanceValidationFailure("merge-place-must-differ");
  }
  if (!hasCompleteFieldResolution(command.fieldResolutions)) {
    return governanceValidationFailure("merge-field-resolution-required");
  }
  const [survivorBase, loserBase] = await store.lockGovernanceRevisionSnapshots(
    [
      {
        placeId: command.survivor.placeId,
        revisionId: command.survivor.baseRevisionId,
      },
      {
        placeId: command.loser.placeId,
        revisionId: command.loser.baseRevisionId,
      },
    ],
  );
  if (!survivorBase || !loserBase) {
    return governanceValidationFailure("merge-base-revision-not-found");
  }
  if (
    survivorBase.visibility !== "public" ||
    loserBase.visibility !== "public"
  ) {
    return governanceValidationFailure("redacted-revision-not-mergeable");
  }
  const convertedSurvivor = toCampusMapRepublishableFact({
    kind: "stored",
    factSchemaVersion: survivorBase.factSchemaVersion,
    fact: survivorBase.fact,
  });
  const convertedLoser = toCampusMapRepublishableFact({
    kind: "stored",
    factSchemaVersion: loserBase.factSchemaVersion,
    fact: loserBase.fact,
  });
  if (!convertedSurvivor.ok || !convertedLoser.ok) {
    return governanceValidationFailure("revision-fact-unavailable");
  }
  if (
    !hasConsistentFieldResolution(
      command.survivor.fact,
      convertedSurvivor.fact,
      convertedLoser.fact,
      command.fieldResolutions,
    )
  ) {
    return governanceValidationFailure("merge-field-resolution-mismatch");
  }

  const lifecycleSource = createCampusMapLifecycleSource(command, actorId);
  const publishCommand: CampusMapPublishCommand = {
    kind: "bulk",
    idempotencyKey: command.idempotencyKey,
    comment: command.reason,
    sourceSummary: `Merge ${command.loser.placeId} into ${command.survivor.placeId}`,
    reviewRequested: false,
    client: command.client,
    warningAcknowledgements: [],
    changes: [
      {
        operation: "update",
        placeId: command.survivor.placeId,
        baseRevisionId: command.survivor.baseRevisionId,
        fact: command.survivor.fact,
        sources: [...command.survivor.sources, lifecycleSource],
      },
      {
        operation: "merge",
        placeId: command.loser.placeId,
        baseRevisionId: command.loser.baseRevisionId,
        mergedIntoPlaceId: command.survivor.placeId,
        sources: [...command.loser.sources, lifecycleSource],
      },
    ],
  };
  return {
    command: publishCommand,
    revertsChangesetId: null,
    noOpUpdatePlaceIds: new Set([command.survivor.placeId]),
  };
}

function normalizeGovernanceCommandIdentifiers(
  command: CampusMapFactGovernanceCommand,
): CampusMapFactGovernanceCommand {
  if (command.kind === "bulk-edit") {
    const normalized = normalizePublishCommandIdentifiers({
      kind: "bulk",
      idempotencyKey: command.idempotencyKey,
      comment: command.reason,
      sourceSummary: command.sourceSummary,
      reviewRequested: false,
      client: command.client,
      warningAcknowledgements: command.warningAcknowledgements,
      changes: command.changes,
    });
    return {
      kind: "bulk-edit",
      idempotencyKey: normalized.idempotencyKey,
      reason: command.reason,
      sourceSummary: command.sourceSummary,
      client: command.client,
      changes: normalized.changes as typeof command.changes,
      warningAcknowledgements: command.warningAcknowledgements,
    };
  }
  if (command.kind === "retire" || command.kind === "restore") {
    return {
      kind: command.kind,
      idempotencyKey: canonicalizeCampusMapUuid(command.idempotencyKey),
      reason: command.reason,
      client: command.client,
      placeId: canonicalizeCampusMapUuid(command.placeId),
      baseRevisionId: canonicalizeCampusMapUuid(command.baseRevisionId),
    };
  }
  if (command.kind === "revert") {
    return {
      kind: "revert",
      idempotencyKey: canonicalizeCampusMapUuid(command.idempotencyKey),
      reason: command.reason,
      client: command.client,
      placeId: canonicalizeCampusMapUuid(command.placeId),
      baseRevisionId: canonicalizeCampusMapUuid(command.baseRevisionId),
      targetRevisionId: canonicalizeCampusMapUuid(command.targetRevisionId),
      sources: command.sources,
    };
  }
  return {
    kind: "merge",
    idempotencyKey: canonicalizeCampusMapUuid(command.idempotencyKey),
    reason: command.reason,
    client: command.client,
    survivor: {
      placeId: canonicalizeCampusMapUuid(command.survivor.placeId),
      baseRevisionId: canonicalizeCampusMapUuid(
        command.survivor.baseRevisionId,
      ),
      fact: normalizeGovernanceFactIdentifiers(command.survivor.fact),
      sources: command.survivor.sources,
    },
    loser: {
      placeId: canonicalizeCampusMapUuid(command.loser.placeId),
      baseRevisionId: canonicalizeCampusMapUuid(command.loser.baseRevisionId),
      sources: command.loser.sources,
    },
    fieldResolutions: command.fieldResolutions,
  };
}

function normalizeGovernanceFactIdentifiers(
  fact: CampusMapPublishFactInput,
): CampusMapPublishFactInput {
  return {
    ...fact,
    buildingId: canonicalizeCampusMapUuid(fact.buildingId),
    floorId: canonicalizeCampusMapUuid(fact.floorId),
  };
}

function hasCompleteFieldResolution(
  resolutions: CampusMapMergeFieldResolution[],
): boolean {
  const fields = resolutions.map((resolution) => resolution.field);
  return (
    resolutions.every(
      (resolution) =>
        resolution.valueFrom === "survivor" ||
        resolution.valueFrom === "loser" ||
        resolution.valueFrom === "custom",
    ) &&
    fields.length === CAMPUS_MAP_MERGE_FACT_FIELDS.length &&
    new Set(fields).size === fields.length &&
    CAMPUS_MAP_MERGE_FACT_FIELDS.every((field) => fields.includes(field))
  );
}

function hasConsistentFieldResolution(
  resolved: CampusMapPublishFactInput,
  survivor: CampusMapPublishFactInput,
  loser: CampusMapPublishFactInput,
  resolutions: CampusMapMergeFieldResolution[],
): boolean {
  const resolvedFact = toAppendFact(resolved);
  return resolutions.every((resolution) => {
    if (resolution.valueFrom === "custom") return true;
    const sourceFact = toAppendFact(
      resolution.valueFrom === "survivor" ? survivor : loser,
    );
    if (resolution.field === "buildingId" || resolution.field === "floorId") {
      return resolvedFact[resolution.field] === sourceFact[resolution.field];
    }
    return !(resolution.field in createFieldDiff(sourceFact, resolvedFact));
  });
}

function lifecycleSnapshotUnavailable(placeId: string): CampusMapPublishResult {
  return {
    status: "validation-failed",
    errors: [
      {
        code: "lifecycle-base-revision-unavailable",
        anchor: { placeId, field: "baseRevisionId" },
      },
    ],
    warnings: [],
    suggestions: [],
  };
}

function governanceValidationFailure(code: string): CampusMapPublishResult {
  return {
    status: "validation-failed",
    errors: [{ code, anchor: { field: "command" } }],
    warnings: [],
    suggestions: [],
  };
}

interface PreparedCampusMapGovernancePublish {
  command: CampusMapPublishCommand;
  revertsChangesetId: string | null;
  noOpUpdatePlaceIds?: ReadonlySet<string>;
  retireFactPlaceIds?: ReadonlySet<string>;
}

function publishCampusMapGovernanceIntent(
  command: Exclude<CampusMapFactGovernanceCommand, { kind: "bulk-edit" }>,
  context: CampusMapPublishContext,
  prepare: (
    store: CampusMapFactStoreTransaction,
    actorId: string,
  ) => Promise<PreparedCampusMapGovernancePublish | CampusMapPublishResult>,
): Promise<CampusMapPublishResult> {
  const commandKind = command.kind === "merge" ? "bulk" : "single";
  let serializedCommand: string | null = null;
  try {
    serializedCommand = JSON.stringify(canonicalize(command));
    if (typeof serializedCommand !== "string") serializedCommand = null;
  } catch {
    serializedCommand = null;
  }
  const placeholder: CampusMapPublishCommand = {
    kind: commandKind,
    idempotencyKey: command.idempotencyKey,
    comment: command.reason,
    sourceSummary: "Campus Map fact governance",
    reviewRequested: false,
    client: command.client,
    warningAcknowledgements: [],
    changes: [],
  };
  return publishCampusMapChangesetInternal(placeholder, context, {
    allowMerge: true,
    requireAdmin: true,
    revertsChangesetId: null,
    noOpUpdatePlaceIds: new Set(),
    retireFactPlaceIds: new Set(),
    requestIdentity: {
      idempotencyKey: command.idempotencyKey,
      kind: commandKind,
      serialized: serializedCommand,
    },
    prepare,
  });
}

async function publishCampusMapChangesetInternal(
  command: CampusMapPublishCommand,
  context: CampusMapPublishContext,
  options: {
    allowMerge: boolean;
    requireAdmin: boolean;
    revertsChangesetId: string | null;
    noOpUpdatePlaceIds: ReadonlySet<string>;
    retireFactPlaceIds: ReadonlySet<string>;
    requestIdentity?: {
      idempotencyKey: string;
      kind: CampusMapPublishCommand["kind"];
      serialized: string | null;
    };
    prepare?: (
      store: CampusMapFactStoreTransaction,
      actorId: string,
    ) => Promise<PreparedCampusMapGovernancePublish | CampusMapPublishResult>;
  },
): Promise<CampusMapPublishResult> {
  const actorId = context.actorId?.toLowerCase() ?? null;
  if (actorId === null) {
    return {
      status: "authentication-required",
      code: "authentication-required",
    };
  }
  const hasValidStructure =
    options.requestIdentity !== undefined ||
    hasPublishCommandStructure(command);
  const normalizedCommand = hasValidStructure
    ? normalizePublishCommandIdentifiers(command)
    : command;
  const requiresFreshAdmin =
    options.requireAdmin ||
    (hasValidStructure &&
      normalizedCommand.changes.some(
        (change) =>
          change.operation === "retire" || change.operation === "restore",
      ));
  let revertsChangesetId = options.revertsChangesetId;
  let noOpUpdatePlaceIds = options.noOpUpdatePlaceIds;
  let retireFactPlaceIds = options.retireFactPlaceIds;
  const serializedCommand =
    options.requestIdentity === undefined
      ? serializePublishCommandIdentity(command)
      : options.requestIdentity.serialized;
  const requestIdempotencyKey =
    options.requestIdentity?.idempotencyKey ?? normalizedCommand.idempotencyKey;
  const requestKind = options.requestIdentity?.kind ?? normalizedCommand.kind;
  try {
    return await db.transaction(async (transaction) => {
      let command = normalizedCommand;
      let requestFingerprint: string | null = null;
      let reusedRequest: StoredPublishRequest | null = null;
      let completedPrivilegedRequest: StoredPublishRequest | null = null;
      if (
        hasValidStructure &&
        serializedCommand !== null &&
        isValidPublishIdempotencyKey(requestIdempotencyKey)
      ) {
        requestFingerprint = fingerprintRequest(serializedCommand);
        const existingRequest = await findPublishRequest(
          transaction,
          actorId,
          requestIdempotencyKey,
        );
        if (existingRequest?.requestFingerprint === requestFingerprint) {
          if (!requiresFreshAdmin) {
            return replayPublishRequest(existingRequest, requestFingerprint);
          }
          completedPrivilegedRequest = existingRequest;
        }
        if (!completedPrivilegedRequest) {
          await acquireTransactionAdvisoryLock(
            transaction,
            `publish-request\u0000${actorId}\u0000${requestIdempotencyKey}`,
          );
          const requestPublishedWhileWaiting = await findPublishRequest(
            transaction,
            actorId,
            requestIdempotencyKey,
          );
          if (
            requestPublishedWhileWaiting?.requestFingerprint ===
            requestFingerprint
          ) {
            if (!requiresFreshAdmin) {
              return replayPublishRequest(
                requestPublishedWhileWaiting,
                requestFingerprint,
              );
            }
            completedPrivilegedRequest = requestPublishedWhileWaiting;
          }
          reusedRequest = requestPublishedWhileWaiting;
        }
      }
      const [actor] = await transaction
        .select({
          id: users.id,
          banned: users.banned,
          emailVerified: users.emailVerified,
          nickname: users.nickname,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, actorId))
        .for("update")
        .limit(1);
      if (!actor) {
        return { status: "forbidden", code: "actor-not-eligible" } as const;
      }
      // Account creation owns the email-shape policy. Campus Map only needs
      // fresh proof that this existing User still owns a verified email.
      if (!actor.emailVerified) {
        return { status: "forbidden", code: "actor-not-eligible" } as const;
      }
      if (actor.banned) {
        return { status: "forbidden", code: "actor-banned" } as const;
      }
      if (
        await findActiveCampusMapContributorBlock(
          transaction,
          actor.id,
          "publish",
          new Date(),
        )
      ) {
        return { status: "forbidden", code: "contributor-blocked" } as const;
      }
      if (actor.role !== "user" && actor.role !== "admin") {
        return { status: "forbidden", code: "role-not-eligible" } as const;
      }
      const [credential] = await transaction
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, actor.id),
            eq(accounts.providerId, "credential"),
            isNotNull(accounts.password),
          ),
        )
        .for("update")
        .limit(1);
      if (actor.nickname.trim() === "" || !credential) {
        return { status: "forbidden", code: "profile-incomplete" } as const;
      }
      // Retiring and restoring are lifecycle governance operations. Check the
      // fresh database role before replaying a completed request so a former
      // admin cannot use an old idempotency key to bypass a later demotion.
      if (requiresFreshAdmin && actor.role !== "admin") {
        return { status: "forbidden", code: "admin-required" } as const;
      }
      if (completedPrivilegedRequest && requestFingerprint !== null) {
        return replayPublishRequest(
          completedPrivilegedRequest,
          requestFingerprint,
        );
      }
      if (
        hasValidStructure &&
        command.kind === "bulk" &&
        actor.role !== "admin"
      ) {
        return { status: "forbidden", code: "admin-required" } as const;
      }
      if (options.requireAdmin && actor.role !== "admin") {
        return { status: "forbidden", code: "admin-required" } as const;
      }
      const rateLimit = await consumePublishRate(
        transaction,
        actor.id,
        context.clientIp,
        new Date(),
      );
      if (rateLimit) return rateLimit;
      if (!hasValidStructure || serializedCommand === null) {
        return invalidCommandResult();
      }
      if (isPublishCommandTooLarge(serializedCommand, requestKind)) {
        return {
          status: "validation-failed",
          errors: [{ code: "command-too-large", anchor: { field: "command" } }],
          warnings: [],
          suggestions: [],
        } as const;
      }
      if (!isValidPublishIdempotencyKey(requestIdempotencyKey)) {
        return {
          status: "validation-failed",
          errors: [
            {
              code: "invalid-idempotency-key",
              anchor: { field: "idempotencyKey" },
            },
          ],
          warnings: [],
          suggestions: [],
        } as const;
      }
      if (requestFingerprint === null) {
        throw new Error("Campus Map request fingerprint was not prepared");
      }
      if (reusedRequest) {
        return replayPublishRequest(reusedRequest, requestFingerprint);
      }
      if (options.prepare) {
        const prepared = await options.prepare(
          new CampusMapFactStoreTransaction(transaction),
          actor.id,
        );
        if ("status" in prepared) return prepared;
        command = normalizePublishCommandIdentifiers(prepared.command);
        revertsChangesetId = prepared.revertsChangesetId;
        noOpUpdatePlaceIds = prepared.noOpUpdatePlaceIds ?? new Set<string>();
        retireFactPlaceIds = prepared.retireFactPlaceIds ?? new Set<string>();
        if (!hasPublishCommandStructure(command)) return invalidCommandResult();
      }
      if (command.kind === "single" && command.changes.length !== 1) {
        return {
          status: "validation-failed",
          errors: [
            { code: "single-place-required", anchor: { field: "changes" } },
          ],
          warnings: [],
          suggestions: [],
        } as const;
      }
      if (command.kind === "bulk" && command.changes.length > 25) {
        return {
          status: "validation-failed",
          errors: [
            { code: "bulk-limit-exceeded", anchor: { field: "changes" } },
          ],
          warnings: [],
          suggestions: [],
        } as const;
      }
      if (command.kind === "bulk" && command.changes.length < 2) {
        return {
          status: "validation-failed",
          errors: [
            {
              code: "bulk-requires-multiple-places",
              anchor: { field: "changes" },
            },
          ],
          warnings: [],
          suggestions: [],
        } as const;
      }
      const commentErrors = validateComment(command.comment);
      if (commentErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: commentErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const metadataErrors = validateChangesetMetadata(command);
      if (metadataErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: metadataErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const identityErrors = validateChangeIdentities(command);
      if (
        !options.allowMerge &&
        command.changes.some((change) => change.operation === "merge")
      ) {
        identityErrors.push({
          code: "invalid-operation",
          anchor: {
            changeIndex: command.changes.findIndex(
              (change) => change.operation === "merge",
            ),
            field: "operation",
          },
        });
      }
      if (identityErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: identityErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const sourceLimit = command.kind === "bulk" ? 16 : 8;
      const sourceHeavyChangeIndex = command.changes.findIndex(
        (change) => change.sources.length > sourceLimit,
      );
      if (sourceHeavyChangeIndex !== -1) {
        return {
          status: "validation-failed",
          errors: [
            {
              code: "source-limit-exceeded",
              anchor: {
                changeIndex: sourceHeavyChangeIndex,
                field: "sources",
              },
            },
          ],
          warnings: [],
          suggestions: [],
        } as const;
      }
      const sourceLessChangeIndex = command.changes.findIndex(
        (change) => change.sources.length === 0,
      );
      if (sourceLessChangeIndex !== -1) {
        return {
          status: "validation-failed",
          errors: [
            {
              code: "source-required",
              anchor: {
                changeIndex: sourceLessChangeIndex,
                field: "sources",
              },
            },
          ],
          warnings: [],
          suggestions: [],
        } as const;
      }
      const factErrors = command.changes.flatMap((change, changeIndex) =>
        change.operation === "merge" ||
        (change.operation === "retire" &&
          !retireFactPlaceIds.has(change.placeId))
          ? []
          : validateFact(change.fact!, changeIndex),
      );
      if (factErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: factErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const sourceErrors = command.changes.flatMap((change, changeIndex) =>
        change.sources.flatMap((source, sourceIndex) =>
          validateSource(source, changeIndex, sourceIndex),
        ),
      );
      if (sourceErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: sourceErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const sourceIdentities = analyzeSourceIdentities(command);
      if (sourceIdentities.errors.length > 0) {
        return {
          status: "validation-failed",
          errors: sourceIdentities.errors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const referenceErrors: CampusMapPublishValidationIssue[] = [];
      for (const [changeIndex, change] of command.changes.entries()) {
        if (
          change.operation === "merge" ||
          (change.operation === "retire" &&
            !retireFactPlaceIds.has(change.placeId))
        )
          continue;
        const fact = change.fact!;
        if (fact.buildingId !== null) {
          const [building] = await transaction
            .select({ id: campusMapBuildings.id })
            .from(campusMapBuildings)
            .where(eq(campusMapBuildings.id, fact.buildingId))
            .limit(1);
          if (!building) {
            referenceErrors.push({
              code: "building-not-found",
              anchor: { changeIndex, field: "location" },
            });
            continue;
          }
        }
        if (fact.location.kind === "floor" && fact.floorId !== null) {
          const [floor] = await transaction
            .select({ buildingId: campusMapFloors.buildingId })
            .from(campusMapFloors)
            .where(eq(campusMapFloors.id, fact.floorId))
            .limit(1);
          if (!floor) {
            referenceErrors.push({
              code: "floor-not-found",
              anchor: { changeIndex, field: "location" },
            });
          } else if (floor.buildingId !== fact.buildingId) {
            referenceErrors.push({
              code: "floor-building-mismatch",
              anchor: { changeIndex, field: "location" },
            });
          }
        }
      }
      if (referenceErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: referenceErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const suggestions: CampusMapPublishValidationIssue[] =
        command.changes.flatMap((change, changeIndex) =>
          change.operation !== "merge" &&
          (change.operation !== "retire" ||
            retireFactPlaceIds.has(change.placeId)) &&
          change.fact!.observedAt === null
            ? [
                {
                  code: "observed-at-recommended",
                  anchor: { changeIndex, field: "observedAt" },
                },
              ]
            : [],
        );
      const publishedAt = new Date();
      const changes: CampusMapAppendPlaceChange[] = [];
      const store = new CampusMapFactStoreTransaction(transaction);
      const lockedByPlace = new Map<
        string,
        CampusMapLockedRevisionSnapshot | null
      >();
      const existingChanges = command.changes
        .filter(
          (
            change,
          ): change is Exclude<
            CampusMapPublishChange,
            { operation: "create" }
          > => change.operation !== "create",
        )
        .sort((left, right) => left.placeId.localeCompare(right.placeId));
      for (const change of existingChanges) {
        if (!lockedByPlace.has(change.placeId)) {
          lockedByPlace.set(
            change.placeId,
            await store.lockCurrentRevisionSnapshot(change.placeId),
          );
        }
      }
      const conflictingChanges = existingChanges.filter((change) => {
        const current = lockedByPlace.get(change.placeId) ?? null;
        return current?.revisionId !== change.baseRevisionId;
      });
      const lockedRevisionIds = [
        ...new Set(
          conflictingChanges.flatMap((change) => {
            const current = lockedByPlace.get(change.placeId) ?? null;
            return current ? [current.revisionId] : [];
          }),
        ),
      ];
      const lockedPhotosByRevision = await loadCampusMapRevisionPhotos(
        transaction,
        lockedRevisionIds,
      );
      const conflicts = conflictingChanges.map((change) => {
        const current = lockedByPlace.get(change.placeId) ?? null;
        const changeIndex = command.changes.indexOf(change);
        return {
          code: "base-revision-conflict" as const,
          anchor: {
            changeIndex,
            placeId: change.placeId,
            field: "baseRevisionId",
          },
          placeId: change.placeId,
          expectedRevisionId: change.baseRevisionId,
          currentRevisionId: current?.revisionId ?? null,
          currentStatus: current?.status ?? null,
          currentSnapshot:
            current?.visibility === "public" ? toSafeSnapshot(current) : null,
          currentPhotos:
            current?.visibility === "public"
              ? (lockedPhotosByRevision.get(current.revisionId) ?? [])
              : [],
        };
      });
      if (conflicts.length > 0) {
        const racedRequest = await findPublishRequest(
          transaction,
          actor.id,
          requestIdempotencyKey,
        );
        if (racedRequest) {
          return replayPublishRequest(racedRequest, requestFingerprint);
        }
        return {
          status: "conflict",
          code: "base-revision-conflict",
          conflicts,
        } as const;
      }
      const redactedErrors = existingChanges.flatMap((change) => {
        const current = lockedByPlace.get(change.placeId);
        if (current?.visibility !== "redacted") return [];
        return [
          {
            code: "redacted-revision-not-editable",
            anchor: {
              changeIndex: command.changes.indexOf(change),
              placeId: change.placeId,
              field: "baseRevisionId",
            },
          },
        ];
      });
      if (redactedErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: redactedErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const transitionErrors = existingChanges.flatMap((change) => {
        const current = lockedByPlace.get(change.placeId);
        const allowed =
          current !== null &&
          current !== undefined &&
          ((change.operation === "update" && current.status === "active") ||
            (change.operation === "retire" && current.status === "active") ||
            (change.operation === "restore" && current.status === "retired") ||
            (change.operation === "merge" &&
              (current.status === "active" || current.status === "retired")));
        if (allowed) return [];
        return [
          {
            code: "operation-not-allowed",
            anchor: {
              changeIndex: command.changes.indexOf(change),
              placeId: change.placeId,
              field: "operation",
            },
          },
        ];
      });
      if (transitionErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: transitionErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const preciseLocationEvidenceIdsByRevision =
        await loadPreciseLocationEvidenceIds(
          transaction,
          [...lockedByPlace.values()].flatMap((current) =>
            current ? [current.revisionId] : [],
          ),
        );
      const preparedPhotos = await prepareCampusMapPlacePhotos(
        transaction,
        command,
        actor.id,
        lockedByPlace,
      );
      if (!preparedPhotos.ok) {
        return {
          status: "validation-failed",
          errors: preparedPhotos.errors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const precisionErrors = command.changes.flatMap((change, changeIndex) => {
        if (
          change.operation === "merge" ||
          (change.operation === "retire" &&
            !retireFactPlaceIds.has(change.placeId)) ||
          change.fact!.location.kind !== "outdoor-point" ||
          change.fact!.location.precision !== "precise"
        ) {
          return [];
        }
        const supportedBySubmittedSource = change.sources.some((source) =>
          supportsPreciseLocationEvidence({
            kind: source.kind,
            rightsStatus: source.rightsStatus,
            hasSourceCoordinate: source.sourceCoordinate !== null,
          }),
        );
        const current =
          change.operation === "create"
            ? null
            : (lockedByPlace.get(change.placeId) ?? null);
        const carriesSupportedLockedLocation =
          current !== null &&
          carriesLockedPreciseLocation(
            current.fact,
            toAppendFact(change.fact!),
          ) &&
          (preciseLocationEvidenceIdsByRevision.get(current.revisionId)
            ?.length ?? 0) > 0;
        return supportedBySubmittedSource || carriesSupportedLockedLocation
          ? []
          : [
              {
                code: "precision-not-supported",
                anchor: { changeIndex, field: "location.precision" },
              },
            ];
      });
      if (precisionErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: precisionErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }
      const emptyUpdateErrors = command.changes.flatMap(
        (change, changeIndex) => {
          if (change.operation !== "update") return [];
          if (noOpUpdatePlaceIds.has(change.placeId)) return [];
          if (preparedPhotos.changedChanges.has(change)) return [];
          const current = lockedByPlace.get(change.placeId);
          if (!current) return [];
          const diff = createFieldDiff(current.fact, toAppendFact(change.fact));
          return Object.keys(diff).length === 0
            ? [
                {
                  code: "no-fact-changes",
                  anchor: {
                    changeIndex,
                    placeId: change.placeId,
                    field: "fact",
                  },
                },
              ]
            : [];
        },
      );
      if (emptyUpdateErrors.length > 0) {
        return {
          status: "validation-failed",
          errors: emptyUpdateErrors,
          warnings: [],
          suggestions: [],
        } as const;
      }

      const appendProvenanceSources = sourceIdentities.sources.map(
        ({ source }) => toAppendProvenanceSource(source),
      );
      const warningNamesByChange = await normalizeAndLockPublishWarningDomains(
        transaction,
        command,
      );
      try {
        await store.validateProvenanceSources(appendProvenanceSources);
      } catch (error) {
        if (error instanceof CampusMapProvenanceIdentityConflictError) {
          const conflictingSource = sourceIdentities.sources.find(
            ({ source }) =>
              source.kind === error.kind && source.ref === error.ref,
          );
          if (!conflictingSource) throw error;
          return {
            status: "validation-failed",
            errors: [sourceRefMismatch(conflictingSource)],
            warnings: [],
            suggestions: [],
          } as const;
        }
        throw error;
      }

      const { warnings, invalidAcknowledgements, hasUnacknowledgedWarning } =
        await evaluatePublishWarnings(
          transaction,
          command,
          warningNamesByChange,
        );
      if (invalidAcknowledgements.length > 0) {
        return {
          status: "validation-failed",
          errors: invalidAcknowledgements,
          warnings,
          suggestions,
        } as const;
      }
      if (hasUnacknowledgedWarning) {
        return {
          status: "validation-failed",
          errors: [],
          warnings,
          suggestions,
        } as const;
      }

      let resolvedProvenanceIds: string[];
      try {
        resolvedProvenanceIds = await store.resolveProvenanceSources(
          appendProvenanceSources,
        );
      } catch (error) {
        if (error instanceof CampusMapProvenanceIdentityConflictError) {
          const conflictingSource = sourceIdentities.sources.find(
            ({ source }) =>
              source.kind === error.kind && source.ref === error.ref,
          );
          if (!conflictingSource) throw error;
          return {
            status: "validation-failed",
            errors: [sourceRefMismatch(conflictingSource)],
            warnings,
            suggestions,
          } as const;
        }
        throw error;
      }
      const provenanceIdByIdentity = new Map(
        sourceIdentities.sources.map(({ source }, index) => [
          sourceIdentity(source),
          resolvedProvenanceIds[index],
        ]),
      );

      const [claimedRequest] = await transaction
        .insert(campusMapPublishRequests)
        .values({
          actorUserId: actor.id,
          actorIdSnapshot: actor.id,
          idempotencyKey: requestIdempotencyKey,
          requestFingerprint,
          status: "processing",
        })
        .onConflictDoNothing({
          target: [
            campusMapPublishRequests.actorIdSnapshot,
            campusMapPublishRequests.idempotencyKey,
          ],
        })
        .returning({ id: campusMapPublishRequests.id });
      if (!claimedRequest) {
        const racedRequest = await findPublishRequest(
          transaction,
          actor.id,
          requestIdempotencyKey,
        );
        if (!racedRequest) {
          throw new Error("Campus Map idempotency request disappeared");
        }
        return replayPublishRequest(racedRequest, requestFingerprint);
      }

      for (const change of command.changes) {
        const current =
          change.operation === "create"
            ? null
            : (lockedByPlace.get(change.placeId) ?? null);
        const currentV2Fact = current
          ? toCampusMapRepublishableFact({
              kind: "stored",
              factSchemaVersion: current.factSchemaVersion,
              fact: current.fact,
            })
          : null;
        if (currentV2Fact && !currentV2Fact.ok) {
          return governanceValidationFailure("revision-fact-unavailable");
        }
        const currentAppendFact = currentV2Fact
          ? toAppendFact(currentV2Fact.fact)
          : null;
        const submittedProvenanceIds = change.sources.map((source) => {
          const provenanceId = provenanceIdByIdentity.get(
            sourceIdentity(source),
          );
          if (!provenanceId)
            throw new Error("Campus Map provenance was not resolved");
          return provenanceId;
        });

        let fact: CampusMapAppendFact;
        if (
          change.operation === "merge" ||
          (change.operation === "retire" &&
            !retireFactPlaceIds.has(change.placeId))
        ) {
          if (!currentAppendFact) {
            return governanceValidationFailure("revision-fact-unavailable");
          }
          fact = currentAppendFact;
        } else {
          fact = toAppendFact(change.fact!);
        }
        const placeId =
          change.operation === "create" ? randomUUID() : change.placeId;
        const revisionId = randomUUID();
        const carriedPreciseLocationEvidenceIds =
          current !== null && carriesLockedPreciseLocation(current.fact, fact)
            ? (preciseLocationEvidenceIdsByRevision.get(current.revisionId) ??
              [])
            : [];
        const provenanceIds = [
          ...new Set([
            ...submittedProvenanceIds,
            ...carriedPreciseLocationEvidenceIds,
          ]),
        ];
        changes.push({
          id: randomUUID(),
          placeId,
          revisionId,
          baseRevisionId:
            change.operation === "create" ? null : change.baseRevisionId,
          operation: change.operation,
          factSchemaVersion: CAMPUS_MAP_ACTIVE_FACT_SCHEMA_VERSION,
          fieldMetadata: CAMPUS_MAP_PUBLISH_FIELD_METADATA_V2,
          fieldDiff: {
            ...createFieldDiff(currentAppendFact, fact),
            ...campusMapPlacePhotoDiff(
              preparedPhotos.basePhotosByChange.get(change) ?? [],
              preparedPhotos.photosByChange.get(change) ?? [],
            ),
          },
          status:
            change.operation === "retire"
              ? "retired"
              : change.operation === "merge"
                ? "merged"
                : "active",
          mergedIntoPlaceId:
            change.operation === "merge" ? change.mergedIntoPlaceId : null,
          fact,
          provenanceIds,
          photos: preparedPhotos.photosByChange.get(change) ?? [],
          visibility: { visibility: "public" },
        });
      }

      const changesetId = randomUUID();
      const publishedResult = {
        status: "published",
        changesetId,
        changes: changes
          .map((change) => ({
            placeId: change.placeId,
            revisionId: change.revisionId,
          }))
          .sort((left, right) => left.placeId.localeCompare(right.placeId)),
        warnings,
        suggestions,
      } as const;
      if (preparedPhotos.assetIdsToBind.length > 0) {
        await transaction
          .update(campusMapPlacePhotoAssets)
          .set({ expiresAt: null, updatedAt: publishedAt })
          .where(
            inArray(
              campusMapPlacePhotoAssets.id,
              preparedPhotos.assetIdsToBind,
            ),
          );
      }
      await store.appendChangeset({
        id: changesetId,
        actor: {
          userId: actor.id,
          id: actor.id,
          nickname: actor.nickname,
        },
        comment: command.comment.trim(),
        sourceSummary: command.sourceSummary.trim(),
        reviewRequested: command.reviewRequested,
        client: command.client,
        warningSummary: warningSummary(warnings),
        revertsChangesetId,
        publishedAt,
        changes,
      });
      const completed = await transaction
        .update(campusMapPublishRequests)
        .set({
          status: "published",
          changesetId,
          result: publishedResult,
          completedAt: publishedAt,
        })
        .where(eq(campusMapPublishRequests.id, claimedRequest.id))
        .returning({ id: campusMapPublishRequests.id });
      if (completed.length !== 1) {
        throw new Error("Campus Map idempotency request was not completed");
      }

      return publishedResult;
    });
  } catch {
    return {
      status: "temporarily-unavailable",
      code: "publish-unavailable",
      retryable: true,
    };
  }
}

async function prepareCampusMapPlacePhotos(
  transaction: DatabaseTransaction,
  command: CampusMapPublishCommand,
  actorId: string,
  lockedByPlace: Map<string, CampusMapLockedRevisionSnapshot | null>,
): Promise<
  | {
      ok: true;
      photosByChange: Map<CampusMapPublishChange, PreparedCampusMapPlacePhotos>;
      basePhotosByChange: Map<
        CampusMapPublishChange,
        PreparedCampusMapPlacePhotos
      >;
      changedChanges: Set<CampusMapPublishChange>;
      assetIdsToBind: string[];
    }
  | { ok: false; errors: CampusMapPublishValidationIssue[] }
> {
  const revisionIds = [
    ...new Set(
      command.changes.flatMap((change) => {
        if (change.operation === "create") return [];
        const current = lockedByPlace.get(change.placeId);
        return current ? [current.revisionId] : [];
      }),
    ),
  ];
  const baseByRevision = await loadCampusMapRevisionPhotos(
    transaction,
    revisionIds,
  );

  const photosByChange = new Map<
    CampusMapPublishChange,
    PreparedCampusMapPlacePhotos
  >();
  const basePhotosByChange = new Map<
    CampusMapPublishChange,
    PreparedCampusMapPlacePhotos
  >();
  const changedChanges = new Set<CampusMapPublishChange>();
  for (const change of command.changes) {
    const current =
      change.operation === "create"
        ? null
        : (lockedByPlace.get(change.placeId) ?? null);
    const base = current
      ? (baseByRevision.get(current.revisionId) ?? []).map((item) => ({
          ...item,
        }))
      : [];
    const desired =
      (change.operation === "create" || change.operation === "update") &&
      change.photos !== undefined
        ? change.photos.map((item) => ({ ...item }))
        : base.map((item) => ({ ...item }));
    photosByChange.set(change, desired);
    basePhotosByChange.set(change, base);
    if (!sameCampusMapPlacePhotos(base, desired)) changedChanges.add(change);
  }

  const desiredAssetIds = [
    ...new Set(
      [...photosByChange.values()].flatMap((items) =>
        items.map((item) => item.assetId),
      ),
    ),
  ].sort();
  const assets =
    desiredAssetIds.length === 0
      ? []
      : await transaction
          .select({
            id: campusMapPlacePhotoAssets.id,
            ownerUserId: campusMapPlacePhotoAssets.ownerUserId,
            status: campusMapPlacePhotoAssets.status,
          })
          .from(campusMapPlacePhotoAssets)
          .where(inArray(campusMapPlacePhotoAssets.id, desiredAssetIds))
          .orderBy(campusMapPlacePhotoAssets.id)
          .for("update");
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const existingBindings =
    desiredAssetIds.length === 0
      ? []
      : await transaction
          .select({
            assetId: campusMapRevisionPhotos.assetId,
            placeId: campusMapFactRevisions.placeId,
          })
          .from(campusMapRevisionPhotos)
          .innerJoin(
            campusMapFactRevisions,
            eq(campusMapFactRevisions.id, campusMapRevisionPhotos.revisionId),
          )
          .where(inArray(campusMapRevisionPhotos.assetId, desiredAssetIds));
  const existingPlaceIdsByAsset = new Map<string, Set<string>>();
  for (const binding of existingBindings) {
    const placeIds = existingPlaceIdsByAsset.get(binding.assetId);
    if (placeIds) placeIds.add(binding.placeId);
    else {
      existingPlaceIdsByAsset.set(binding.assetId, new Set([binding.placeId]));
    }
  }
  const errors: CampusMapPublishValidationIssue[] = [];
  const commandTargetByAsset = new Map<string, string>();
  for (const [changeIndex, change] of command.changes.entries()) {
    const baseIds = new Set(
      (basePhotosByChange.get(change) ?? []).map((item) => item.assetId),
    );
    for (const item of photosByChange.get(change) ?? []) {
      const asset = assetById.get(item.assetId);
      const target =
        change.operation === "create"
          ? `new-place:${changeIndex}`
          : change.placeId;
      const priorTarget = commandTargetByAsset.get(item.assetId);
      const boundPlaceIds = existingPlaceIdsByAsset.get(item.assetId);
      if (!asset || asset.status !== "ready") {
        errors.push({
          code: "photo-not-ready",
          anchor: { changeIndex, field: "photos" },
        });
      } else if (
        (priorTarget !== undefined && priorTarget !== target) ||
        (boundPlaceIds !== undefined &&
          (change.operation === "create" ||
            [...boundPlaceIds].some((placeId) => placeId !== change.placeId)))
      ) {
        errors.push({
          code: "photo-place-mismatch",
          anchor: { changeIndex, field: "photos" },
        });
      } else if (asset.ownerUserId !== actorId && !baseIds.has(item.assetId)) {
        errors.push({
          code: "photo-not-owned",
          anchor: { changeIndex, field: "photos" },
        });
      }
      commandTargetByAsset.set(item.assetId, target);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    photosByChange,
    basePhotosByChange,
    changedChanges,
    assetIdsToBind: desiredAssetIds,
  };
}

function advisoryLockKey(identity: string): bigint {
  return createHash("sha256")
    .update(identity, "utf8")
    .digest()
    .readBigInt64BE(0);
}

async function acquireTransactionAdvisoryLock(
  transaction: DatabaseTransaction,
  identity: string,
): Promise<void> {
  const lockKey = advisoryLockKey(identity);
  await transaction.execute(
    sql`select pg_advisory_xact_lock(${lockKey.toString()}::bigint)`,
  );
}

async function normalizeAndLockPublishWarningDomains(
  transaction: DatabaseTransaction,
  command: CampusMapPublishCommand,
): Promise<ReadonlyMap<number, string>> {
  const proposedDomains = command.changes.flatMap((change, changeIndex) =>
    change.operation === "retire" || change.operation === "merge"
      ? []
      : [
          {
            changeIndex,
            name: change.fact.name.trim(),
            placeType: change.fact.placeType,
          },
        ],
  );
  if (proposedDomains.length === 0) return new Map();
  const normalized = await transaction.execute<{
    changeIndex: number;
    normalizedName: string;
    placeType: string;
  }>(sql`
    select
      (domain.value->>'changeIndex')::integer as "changeIndex",
      lower(btrim(domain.value->>'name')) as "normalizedName",
      domain.value->>'placeType' as "placeType"
    from jsonb_array_elements(${JSON.stringify(proposedDomains)}::jsonb)
      as domain(value)
    order by
      lower(btrim(domain.value->>'name')) collate "C",
      (domain.value->>'placeType') collate "C",
      (domain.value->>'changeIndex')::integer
  `);
  const normalizedByChange = new Map<number, string>();
  const lockedDomains = new Set<string>();
  for (const domain of normalized.rows) {
    normalizedByChange.set(domain.changeIndex, domain.normalizedName);
    const identity = `${domain.normalizedName}\u0000${domain.placeType}`;
    if (lockedDomains.has(identity)) continue;
    lockedDomains.add(identity);
    await acquireTransactionAdvisoryLock(
      transaction,
      `publish-warning\u0000${identity}`,
    );
  }
  return normalizedByChange;
}

async function evaluatePublishWarnings(
  transaction: DatabaseTransaction,
  command: CampusMapPublishCommand,
  normalizedNames: ReadonlyMap<number, string>,
): Promise<{
  warnings: CampusMapPublishWarning[];
  invalidAcknowledgements: CampusMapPublishValidationIssue[];
  hasUnacknowledgedWarning: boolean;
}> {
  const warnings: CampusMapPublishWarning[] = [];
  const commandPlaceIds = new Set(
    command.changes.flatMap((change) =>
      change.operation === "create" ? [] : [change.placeId],
    ),
  );
  for (const [changeIndex, change] of command.changes.entries()) {
    if (change.operation === "retire" || change.operation === "merge") continue;
    const normalizedName = normalizedNames.get(changeIndex);
    if (normalizedName === undefined) {
      throw new Error("Campus Map warning name was not normalized");
    }
    const currentCandidates = await transaction
      .select({
        placeId: campusMapCurrentFacts.placeId,
        revisionId: campusMapCurrentFacts.revisionId,
        pinType: campusMapCurrentFacts.pinType,
        locationKind: campusMapCurrentFacts.locationKind,
        buildingId: campusMapCurrentFacts.buildingId,
        floorId: campusMapCurrentFacts.floorId,
        longitude: campusMapCurrentFacts.longitude,
        latitude: campusMapCurrentFacts.latitude,
        coordinateCrs: campusMapCurrentFacts.coordinateCrs,
        pointPrecision: campusMapCurrentFacts.pointPrecision,
      })
      .from(campusMapCurrentFacts)
      .innerJoin(
        campusMapRevisionVisibility,
        eq(
          campusMapCurrentFacts.revisionId,
          campusMapRevisionVisibility.revisionId,
        ),
      )
      .where(
        and(
          eq(campusMapCurrentFacts.pinType, change.fact.placeType),
          eq(campusMapRevisionVisibility.visibility, "public"),
          sql`btrim(${campusMapCurrentFacts.name}) <> ''`,
          sql`lower(btrim(${campusMapCurrentFacts.name})) = ${normalizedName}`,
        ),
      )
      .orderBy(asc(campusMapCurrentFacts.placeId));
    const currentDuplicates = currentCandidates.filter(
      (candidate) =>
        !commandPlaceIds.has(candidate.placeId) &&
        isPreciseOutdoorDuplicateCandidate(candidate, change.fact),
    );
    const duplicateCandidates: unknown[] = currentDuplicates.map(
      (candidate) => ({
        kind: "current",
        placeId: candidate.placeId,
        revisionId: candidate.revisionId,
        fact: currentFactWarningInputs(candidate, normalizedName),
      }),
    );
    const commandCandidates = command.changes
      .slice(0, changeIndex)
      .flatMap((candidate, candidateIndex) => {
        const candidateNormalizedName = normalizedNames.get(candidateIndex);
        if (
          candidate.operation === "retire" ||
          candidate.operation === "merge" ||
          candidateNormalizedName === undefined ||
          candidateNormalizedName !== normalizedName ||
          candidate.fact.placeType !== change.fact.placeType ||
          !isPreciseOutdoorDuplicateCandidate(
            toDuplicateLocation(candidate.fact),
            change.fact,
          )
        ) {
          return [];
        }
        return [
          {
            kind: "command",
            changeIndex: candidateIndex,
            operation: candidate.operation,
            placeId:
              candidate.operation === "create" ? null : candidate.placeId,
            fact: factWarningInputs(candidate.fact, candidateNormalizedName),
          },
        ];
      });
    duplicateCandidates.push(...commandCandidates);
    if (duplicateCandidates.length === 0) continue;
    const anchorPlaceId =
      currentDuplicates.at(0)?.placeId ??
      commandCandidates
        .map((candidate) => candidate.placeId)
        .find((placeId): placeId is string => placeId !== null);
    warnings.push({
      code: "possible-duplicate",
      anchor: {
        changeIndex,
        ...(anchorPlaceId === undefined ? {} : { placeId: anchorPlaceId }),
        field: "name",
      },
      fingerprint: warningFingerprint({
        code: "possible-duplicate",
        changeIndex,
        operation: change.operation,
        placeId: change.operation === "create" ? null : change.placeId,
        fact: factWarningInputs(change.fact, normalizedName),
        candidates: duplicateCandidates,
      }),
    });
  }

  const acknowledgedWarnings = new Set<string>();
  const invalidAcknowledgements: CampusMapPublishValidationIssue[] = [];
  for (const acknowledgement of command.warningAcknowledgements) {
    const warning = warnings.find(
      (candidate) =>
        candidate.code === acknowledgement.code &&
        candidate.anchor.changeIndex === acknowledgement.changeIndex &&
        candidate.fingerprint === acknowledgement.fingerprint,
    );
    const key = `${acknowledgement.changeIndex}:${acknowledgement.code}`;
    if (!warning || acknowledgedWarnings.has(key)) {
      invalidAcknowledgements.push({
        code: "warning-acknowledgement-invalid",
        anchor: {
          changeIndex: acknowledgement.changeIndex,
          field: "warningAcknowledgements",
        },
      });
    } else {
      acknowledgedWarnings.add(key);
    }
  }
  const hasUnacknowledgedWarning = warnings.some(
    (warning) =>
      !acknowledgedWarnings.has(
        `${warning.anchor.changeIndex}:${warning.code}`,
      ),
  );
  return { warnings, invalidAcknowledgements, hasUnacknowledgedWarning };
}

function toDuplicateLocation(fact: CampusMapPublishFactInput) {
  return {
    locationKind: fact.location.kind,
    buildingId: fact.buildingId,
    floorId: fact.floorId,
    pointPrecision:
      fact.location.kind === "outdoor-point" ? fact.location.precision : null,
    longitude:
      fact.location.kind === "outdoor-point" ? fact.location.longitude : null,
    latitude:
      fact.location.kind === "outdoor-point" ? fact.location.latitude : null,
  };
}

function isPreciseOutdoorDuplicateCandidate(
  candidate: {
    locationKind: string;
    buildingId: string | null;
    floorId: string | null;
    pointPrecision: string | null;
    longitude: number | null;
    latitude: number | null;
  },
  fact: CampusMapPublishFactInput,
): boolean {
  if (fact.location.kind !== "outdoor-point") return false;
  return (
    candidate.locationKind === "outdoor-point" &&
    candidate.pointPrecision === "precise" &&
    fact.location.precision === "precise" &&
    candidate.longitude !== null &&
    candidate.latitude !== null &&
    Math.abs(candidate.longitude - fact.location.longitude) <= 0.0005 &&
    Math.abs(candidate.latitude - fact.location.latitude) <= 0.0005
  );
}

function factWarningInputs(
  fact: CampusMapPublishFactInput,
  normalizedName: string,
) {
  return {
    name: normalizedName,
    placeType: fact.placeType,
    location:
      fact.location.kind === "building"
        ? { kind: "building", buildingId: fact.buildingId }
        : fact.location.kind === "floor"
          ? {
              kind: "floor",
              buildingId: fact.buildingId,
              floorId: fact.floorId,
            }
          : {
              kind: "outdoor-point",
              longitude: fact.location.longitude,
              latitude: fact.location.latitude,
              crs: fact.location.crs,
              precision: fact.location.precision,
            },
  };
}

function currentFactWarningInputs(
  candidate: {
    pinType: string;
    locationKind: string;
    buildingId: string | null;
    floorId: string | null;
    longitude: number | null;
    latitude: number | null;
    coordinateCrs: string | null;
    pointPrecision: string | null;
  },
  normalizedName: string,
) {
  return {
    name: normalizedName,
    placeType: candidate.pinType,
    location:
      candidate.locationKind === "building"
        ? { kind: "building", buildingId: candidate.buildingId }
        : candidate.locationKind === "floor"
          ? {
              kind: "floor",
              buildingId: candidate.buildingId,
              floorId: candidate.floorId,
            }
          : {
              kind: "outdoor-point",
              longitude: candidate.longitude,
              latitude: candidate.latitude,
              crs: candidate.coordinateCrs,
              precision: candidate.pointPrecision,
            },
  };
}

function warningFingerprint(input: unknown): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret)
    throw new Error("AUTH_SECRET is required for warning fingerprints");
  return createHmac("sha256", secret)
    .update(JSON.stringify(input), "utf8")
    .digest("hex");
}

function warningSummary(
  warnings: CampusMapPublishWarning[],
): Array<{ code: string; count: number }> {
  const counts = new Map<string, number>();
  for (const warning of warnings) {
    counts.set(warning.code, (counts.get(warning.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({ code, count }));
}

function fingerprintRequest(serializedCommand: string): string {
  return createHash("sha256").update(serializedCommand, "utf8").digest("hex");
}

function serializePublishCommandIdentity(
  command: CampusMapPublishCommand,
): string | null {
  try {
    const serialized = JSON.stringify(
      canonicalize(normalizePublishCommandIdentifiers(command)),
    );
    return typeof serialized === "string" ? serialized : null;
  } catch {
    return null;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

async function findPublishRequest(
  transaction: DatabaseTransaction,
  actorId: string,
  idempotencyKey: string,
): Promise<StoredPublishRequest | null> {
  const [request] = await transaction
    .select({
      requestFingerprint: campusMapPublishRequests.requestFingerprint,
      status: campusMapPublishRequests.status,
      result: campusMapPublishRequests.result,
    })
    .from(campusMapPublishRequests)
    .where(
      and(
        eq(campusMapPublishRequests.actorIdSnapshot, actorId),
        eq(campusMapPublishRequests.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return request ?? null;
}

function replayPublishRequest(
  request: StoredPublishRequest,
  fingerprint: string,
): CampusMapPublishResult {
  if (request.requestFingerprint !== fingerprint) {
    return {
      status: "validation-failed",
      errors: [
        {
          code: "idempotency-key-reused",
          anchor: { field: "idempotencyKey" },
        },
      ],
      warnings: [],
      suggestions: [],
    };
  }
  if (request.status === "published" && request.result !== null) {
    return request.result;
  }
  return {
    status: "temporarily-unavailable",
    code: "publish-unavailable",
    retryable: true,
  };
}

function createFieldDiff(
  before: CampusMapAppendFact | null,
  after: CampusMapAppendFact,
): CampusMapFieldDiff {
  const beforeValues = before === null ? null : factDiffValues(before);
  const afterValues = factDiffValues(after);
  return Object.fromEntries(
    (Object.entries(afterValues) as [CampusMapPublishDiffField, unknown][])
      .filter(
        ([field, value]) =>
          beforeValues === null ||
          JSON.stringify(beforeValues[field]) !== JSON.stringify(value),
      )
      .map(([field, value]) => [
        field,
        {
          before: beforeValues?.[field] ?? null,
          after: value,
          label: CAMPUS_MAP_PUBLISH_FIELD_METADATA_V2[field]?.label ?? field,
        },
      ]),
  );
}

function factDiffValues(
  fact: CampusMapAppendFact,
): Record<CampusMapPublishDiffField, unknown> {
  return {
    name: fact.name,
    placeType: fact.pinType,
    regularHours: regularHoursDiffValue(fact),
    officialActions: fact.officialActions.map((action) => ({ ...action })),
    visitNote: fact.visitNote,
    capabilities: [...fact.capabilities].sort(
      (left, right) =>
        CAMPUS_MAP_CAPABILITIES.indexOf(left) -
        CAMPUS_MAP_CAPABILITIES.indexOf(right),
    ),
    gender: fact.gender,
    wheelchairAccess: fact.wheelchairAccess,
    location: locationDiffValue(fact),
    observedAt: fact.observedAt?.toISOString() ?? null,
  };
}

function regularHoursDiffValue(fact: CampusMapAppendFact): unknown {
  const hours = fact.regularHours;
  if (!hours) return null;
  const intervals = hours.intervals.map((interval) => ({
    days: [...interval.days].sort(
      (left, right) =>
        CAMPUS_MAP_WEEKDAYS.indexOf(left) - CAMPUS_MAP_WEEKDAYS.indexOf(right),
    ),
    opensAt: interval.opensAt,
    closesAt: interval.closesAt,
  }));
  intervals.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  return {
    timezone: hours.timezone,
    intervals,
  };
}

function locationDiffValue(fact: CampusMapAppendFact): unknown {
  if (fact.locationKind === "building") {
    return { kind: "building", buildingId: fact.buildingId };
  }
  if (fact.locationKind === "floor") {
    return {
      kind: "floor",
      buildingId: fact.buildingId,
      floorId: fact.floorId,
    };
  }
  return {
    kind: "outdoor-point",
    longitude: fact.longitude,
    latitude: fact.latitude,
    crs: fact.coordinateCrs,
    precision: fact.pointPrecision,
  };
}

function carriesLockedPreciseLocation(
  before: CampusMapAppendFact,
  after: CampusMapAppendFact,
) {
  return (
    before.locationKind === "outdoor-point" &&
    before.pointPrecision === "precise" &&
    after.locationKind === "outdoor-point" &&
    after.pointPrecision === "precise" &&
    JSON.stringify(locationDiffValue(before)) ===
      JSON.stringify(locationDiffValue(after))
  );
}

function toSafeSnapshot(
  current: CampusMapLockedRevisionSnapshot,
): CampusMapPublishSafeSnapshot | null {
  const converted = toCampusMapRepublishableFact({
    kind: "stored",
    factSchemaVersion: current.factSchemaVersion,
    fact: current.fact,
  });
  return converted.ok
    ? { factSchemaVersion: current.factSchemaVersion, ...converted.fact }
    : null;
}
