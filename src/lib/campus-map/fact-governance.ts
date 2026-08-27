import {
  getCampusMapPlaceHistory,
  getCampusMapPlaceRevision,
  type CampusMapHistoricalFact,
} from "@/lib/campus-map/fact-store";
import {
  publishCampusMapChangeset,
  publishCampusMapGovernanceChangeset,
  type CampusMapPublishChange,
  type CampusMapPublishCommand,
  type CampusMapPublishContext,
  type CampusMapPublishFactInput,
  type CampusMapPublishResult,
  type CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish";

export type CampusMapMergeFactField = keyof CampusMapPublishFactInput;

export interface CampusMapMergeFieldResolution {
  field: CampusMapMergeFactField;
  valueFrom: "survivor" | "loser" | "custom";
}

interface CampusMapGovernanceCommandBase {
  idempotencyKey: string;
  reason: string;
  client: { name: string; version: string };
}

export type CampusMapFactGovernanceCommand =
  | (CampusMapGovernanceCommandBase & {
      kind: "revert";
      placeId: string;
      baseRevisionId: string;
      targetRevisionId: string;
      sources: CampusMapPublishSourceInput[];
    })
  | (CampusMapGovernanceCommandBase & {
      kind: "merge";
      survivor: {
        placeId: string;
        baseRevisionId: string;
        fact: CampusMapPublishFactInput;
        sources: CampusMapPublishSourceInput[];
      };
      loser: {
        placeId: string;
        baseRevisionId: string;
        sources: CampusMapPublishSourceInput[];
      };
      fieldResolutions: CampusMapMergeFieldResolution[];
    })
  | (CampusMapGovernanceCommandBase & {
      kind: "bulk-edit";
      sourceSummary: string;
      changes: Exclude<
        CampusMapPublishChange,
        { operation: "create" | "merge" }
      >[];
      warningAcknowledgements: CampusMapPublishCommand["warningAcknowledgements"];
    });

const MERGE_FACT_FIELDS = [
  "name",
  "buildingId",
  "floorId",
  "pinType",
  "capabilities",
  "gender",
  "wheelchairAccess",
  "audience",
  "credentialRequirement",
  "accessSchedule",
  "reservationRequirement",
  "temporaryStatus",
  "location",
  "observedAt",
] as const satisfies readonly CampusMapMergeFactField[];

/**
 * Sole application seam for high-privilege canonical fact governance.
 * Identity comes only from trusted server context and is rechecked by the
 * existing atomic publisher inside the write transaction.
 */
export async function governCampusMapFacts(
  command: CampusMapFactGovernanceCommand,
  context: CampusMapPublishContext,
): Promise<CampusMapPublishResult> {
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
    return revertCampusMapFact(command, context);
  }

  return mergeCampusMapFacts(command, context);
}

async function revertCampusMapFact(
  command: Extract<CampusMapFactGovernanceCommand, { kind: "revert" }>,
  context: CampusMapPublishContext,
): Promise<CampusMapPublishResult> {
  const [target, history] = await Promise.all([
    getCampusMapPlaceRevision(command.placeId, command.targetRevisionId),
    getCampusMapPlaceHistory(command.placeId, { limit: 1 }),
  ]);
  if (!target) return governanceValidationFailure("revision-not-found");
  if (target.content.visibility !== "public") {
    return governanceValidationFailure("redacted-revision-not-revertible");
  }
  if (history.head?.status === "merged") {
    return governanceValidationFailure("merged-place-not-revertible");
  }
  if (target.status === "merged") {
    return governanceValidationFailure("revision-status-not-revertible");
  }
  const operation =
    target.status === "retired"
      ? "retire"
      : history.head?.status === "retired"
        ? "restore"
        : "update";
  if (operation === "retire" && history.head?.status !== "active") {
    return governanceValidationFailure("revision-status-not-revertible");
  }
  const targetFact = toPublishFact(target.content.fact);
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
        fact: targetFact,
        sources: command.sources,
      },
    ],
  };
  return publishCampusMapGovernanceChangeset(publishCommand, context, {
    revertsChangesetId: target.changesetId,
    retireFactPlaceIds:
      operation === "retire"
        ? new Set([command.placeId.toLowerCase()])
        : undefined,
    requestFingerprintContext: {
      kind: command.kind,
      targetRevisionId: command.targetRevisionId,
    },
  });
}

async function mergeCampusMapFacts(
  command: Extract<CampusMapFactGovernanceCommand, { kind: "merge" }>,
  context: CampusMapPublishContext,
): Promise<CampusMapPublishResult> {
  if (command.survivor.placeId === command.loser.placeId) {
    return governanceValidationFailure("merge-place-must-differ");
  }
  if (!hasCompleteFieldResolution(command.fieldResolutions)) {
    return governanceValidationFailure("merge-field-resolution-required");
  }
  const [survivorBase, loserBase] = await Promise.all([
    getCampusMapPlaceRevision(
      command.survivor.placeId,
      command.survivor.baseRevisionId,
    ),
    getCampusMapPlaceRevision(
      command.loser.placeId,
      command.loser.baseRevisionId,
    ),
  ]);
  if (!survivorBase || !loserBase) {
    return governanceValidationFailure("merge-base-revision-not-found");
  }
  if (
    survivorBase.content.visibility !== "public" ||
    loserBase.content.visibility !== "public"
  ) {
    return governanceValidationFailure("redacted-revision-not-mergeable");
  }
  if (
    !hasConsistentFieldResolution(
      command.survivor.fact,
      toPublishFact(survivorBase.content.fact),
      toPublishFact(loserBase.content.fact),
      command.fieldResolutions,
    )
  ) {
    return governanceValidationFailure("merge-field-resolution-mismatch");
  }

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
        sources: command.survivor.sources,
      },
      {
        operation: "merge",
        placeId: command.loser.placeId,
        baseRevisionId: command.loser.baseRevisionId,
        mergedIntoPlaceId: command.survivor.placeId,
        sources: command.loser.sources,
      },
    ],
  };
  return publishCampusMapGovernanceChangeset(publishCommand, context, {
    revertsChangesetId: null,
    noOpUpdatePlaceIds: new Set([command.survivor.placeId.toLowerCase()]),
    requestFingerprintContext: {
      kind: command.kind,
      fieldResolutions: command.fieldResolutions,
    },
  });
}

function hasCompleteFieldResolution(
  resolutions: CampusMapMergeFieldResolution[],
): boolean {
  const fields = resolutions.map((resolution) => resolution.field);
  return (
    fields.length === MERGE_FACT_FIELDS.length &&
    new Set(fields).size === fields.length &&
    MERGE_FACT_FIELDS.every((field) => fields.includes(field))
  );
}

function hasConsistentFieldResolution(
  resolved: CampusMapPublishFactInput,
  survivor: CampusMapPublishFactInput,
  loser: CampusMapPublishFactInput,
  resolutions: CampusMapMergeFieldResolution[],
): boolean {
  return resolutions.every((resolution) => {
    if (resolution.valueFrom === "custom") return true;
    const source = resolution.valueFrom === "survivor" ? survivor : loser;
    return (
      JSON.stringify(resolved[resolution.field]) ===
      JSON.stringify(source[resolution.field])
    );
  });
}

function toPublishFact(
  fact: CampusMapHistoricalFact,
): CampusMapPublishFactInput {
  return {
    name: fact.name,
    buildingId: fact.buildingId,
    floorId: fact.floorId,
    pinType: fact.pinType,
    capabilities: [...fact.capabilities],
    gender: fact.gender,
    wheelchairAccess: fact.wheelchairAccess,
    audience: fact.audience,
    credentialRequirement: fact.credentialRequirement,
    accessSchedule: fact.accessSchedule,
    reservationRequirement: fact.reservationRequirement,
    temporaryStatus: fact.temporaryStatus,
    location:
      fact.locationKind === "outdoor-point"
        ? {
            kind: "outdoor-point",
            longitude: fact.longitude!,
            latitude: fact.latitude!,
            crs: "wgs84",
            precision: fact.pointPrecision!,
          }
        : { kind: fact.locationKind },
    observedAt: fact.observedAt?.toISOString() ?? null,
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
