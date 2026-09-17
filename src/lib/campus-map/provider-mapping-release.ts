import { createHash } from "node:crypto";

import { isCanonicalCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import {
  campusMapProviderIdentityKey,
  normalizeCampusMapProviderIdentity,
  normalizeCampusMapProviderMappingTarget,
  sameCampusMapProviderMappingTarget,
  validateCampusMapProviderIdentity,
  type CampusMapProviderIdentity,
  type CampusMapProviderMappingTarget,
} from "@/lib/campus-map/provider-mapping-domain";
import type { CampusMapAppendProvenanceSource } from "@/lib/campus-map/fact-store-transaction";
import type {
  CampusMapProviderMappingCommand,
  CampusMapProviderMappingCommandResult,
} from "@/lib/campus-map/provider-mapping-registry";

const SCHEMA_VERSION = "cuhk-campus-map-provider-mapping-release/2" as const;
const VERIFICATION_METHOD = "real-amap-sdk-hotspotclick" as const;

interface CampusMapProviderMappingReleaseEvidence {
  providerLabel: string;
  verificationMethod: typeof VERIFICATION_METHOD;
  observedAt: string;
  note: string;
}

interface CampusMapProviderMappingReleaseProvenance {
  sourceRef: string;
  sourceOwner: string;
  sourceVersion: string;
  accessedOn: string;
  observedAt: string | null;
  rightsStatus: "restricted" | "unknown";
  limitations: string;
  note: string;
}

interface CampusMapProviderMappingReleaseMappedDecision {
  label: string;
  identity: CampusMapProviderIdentity;
  target: CampusMapProviderMappingTarget;
  evidence: CampusMapProviderMappingReleaseEvidence;
  provenance: CampusMapProviderMappingReleaseProvenance;
}

interface CampusMapProviderMappingReleaseExistingDecision {
  label: string;
  identity: CampusMapProviderIdentity;
  target: CampusMapProviderMappingTarget;
  evidence: CampusMapProviderMappingReleaseEvidence;
  provenance: CampusMapProviderMappingReleaseProvenance;
}

interface CampusMapProviderMappingReleaseUnresolvedDecision {
  label: string;
  identity: CampusMapProviderIdentity;
  evidence: CampusMapProviderMappingReleaseEvidence;
  reason: string;
}

export interface CampusMapProviderMappingReleaseManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  manifestVersion: string;
  accessedOn: string;
  approval: {
    status: "approved";
    reviewedBy: string;
    reviewedOn: string;
  };
  reason: string;
  mappings: CampusMapProviderMappingReleaseMappedDecision[];
  verifyExisting: CampusMapProviderMappingReleaseExistingDecision[];
  unresolved: CampusMapProviderMappingReleaseUnresolvedDecision[];
}

export type CampusMapProviderMappingReleaseAction = "apply" | "verify";

export interface CampusMapProviderMappingReleasePorts {
  governance(identity: CampusMapProviderIdentity): Promise<
    | {
        status: "ok";
        activeTarget: CampusMapProviderMappingTarget | null;
        activeProvenance: {
          id: string;
          kind: string;
          ref: string;
          owner: string | null;
          version: string | null;
          accessedOn: string;
          observedAt: string | null;
          rightsStatus: string;
          limitations: string | null;
          note: string | null;
        } | null;
        latestEvent: {
          kind: "bind" | "unlink" | "rebind";
          newTarget: CampusMapProviderMappingTarget | null;
          actor: { id: string; nickname: string };
          reason: string;
          provenanceId: string;
          occurredAt: string;
        } | null;
      }
    | { status: "failed"; code: string }
  >;
  validateTarget(
    target: CampusMapProviderMappingTarget,
  ): Promise<"valid" | "not-found">;
  resolveProvenance(
    sources: CampusMapAppendProvenanceSource[],
  ): Promise<
    | { status: "ok"; provenanceIds: string[] }
    | { status: "failed"; code: string }
  >;
  command(
    command: CampusMapProviderMappingCommand,
  ): Promise<CampusMapProviderMappingCommandResult>;
  resolve(
    identity: CampusMapProviderIdentity,
  ): Promise<CampusMapProviderMappingTarget | null>;
}

export type CampusMapProviderMappingReleaseResult =
  | {
      status: "ok";
      action: CampusMapProviderMappingReleaseAction;
      changed: number;
      verified: number;
      mappings: number;
      verifiedExisting: number;
      unresolved: number;
    }
  | {
      status: "failed";
      stage: "preflight" | "provenance" | "command" | "verify";
      label: string;
      code: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function nonEmptyText(value: unknown, maximumBytes = 2_000): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, "utf8") <= maximumBytes
  );
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
  );
}

function isDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(new Date(value).valueOf())
  );
}

function parseIdentity(value: unknown): CampusMapProviderIdentity | null {
  const identity = normalizeCampusMapProviderIdentity(value);
  return identity &&
    identity.provider === "amap" &&
    validateCampusMapProviderIdentity(identity).length === 0
    ? identity
    : null;
}

function parseTarget(value: unknown): CampusMapProviderMappingTarget | null {
  const target = normalizeCampusMapProviderMappingTarget(value);
  if (!target) return null;
  const targetId =
    target.kind === "building" ? target.buildingId : target.placeId;
  return isCanonicalCampusMapUuid(targetId) ? target : null;
}

function parseEvidence(
  value: unknown,
  accessedOn: string,
): CampusMapProviderMappingReleaseEvidence | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "providerLabel",
      "verificationMethod",
      "observedAt",
      "note",
    ]) ||
    !nonEmptyText(value.providerLabel, 512) ||
    value.verificationMethod !== VERIFICATION_METHOD ||
    !isDateTime(value.observedAt) ||
    value.observedAt.slice(0, 10) !== accessedOn ||
    !nonEmptyText(value.note)
  ) {
    return null;
  }
  return {
    providerLabel: value.providerLabel,
    verificationMethod: value.verificationMethod,
    observedAt: value.observedAt,
    note: value.note,
  };
}

function parseProvenance(
  value: unknown,
  identity: CampusMapProviderIdentity,
): CampusMapProviderMappingReleaseProvenance | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "sourceRef",
      "sourceOwner",
      "sourceVersion",
      "accessedOn",
      "observedAt",
      "rightsStatus",
      "limitations",
      "note",
    ]) ||
    !nonEmptyText(value.sourceRef, 1_000) ||
    !value.sourceRef.startsWith(
      `amap:poi:${identity.providerObjectId}:hotspotclick:`,
    ) ||
    !nonEmptyText(value.sourceOwner, 512) ||
    !nonEmptyText(value.sourceVersion, 512) ||
    !isDate(value.accessedOn) ||
    (value.observedAt !== null &&
      (!isDateTime(value.observedAt) ||
        value.observedAt.slice(0, 10) !== value.accessedOn)) ||
    (value.rightsStatus !== "restricted" && value.rightsStatus !== "unknown") ||
    !nonEmptyText(value.limitations) ||
    !nonEmptyText(value.note)
  ) {
    return null;
  }
  return {
    sourceRef: value.sourceRef,
    sourceOwner: value.sourceOwner,
    sourceVersion: value.sourceVersion,
    accessedOn: value.accessedOn,
    observedAt: value.observedAt,
    rightsStatus: value.rightsStatus,
    limitations: value.limitations,
    note: value.note,
  };
}

function parseMappedDecision(
  value: unknown,
  accessedOn: string,
): CampusMapProviderMappingReleaseMappedDecision | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "label",
      "identity",
      "target",
      "evidence",
      "provenance",
    ]) ||
    !nonEmptyText(value.label, 512)
  ) {
    return null;
  }
  const identity = parseIdentity(value.identity);
  const target = parseTarget(value.target);
  const evidence = parseEvidence(value.evidence, accessedOn);
  const provenance = identity
    ? parseProvenance(value.provenance, identity)
    : null;
  return identity &&
    target &&
    evidence &&
    provenance &&
    provenance.accessedOn === accessedOn &&
    provenance.observedAt === evidence.observedAt
    ? { label: value.label, identity, target, evidence, provenance }
    : null;
}

function parseExistingDecision(
  value: unknown,
  accessedOn: string,
): CampusMapProviderMappingReleaseExistingDecision | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "label",
      "identity",
      "target",
      "evidence",
      "provenance",
    ]) ||
    !nonEmptyText(value.label, 512)
  ) {
    return null;
  }
  const identity = parseIdentity(value.identity);
  const target = parseTarget(value.target);
  const evidence = parseEvidence(value.evidence, accessedOn);
  const provenance = identity
    ? parseProvenance(value.provenance, identity)
    : null;
  return identity && target && evidence && provenance
    ? { label: value.label, identity, target, evidence, provenance }
    : null;
}

function parseUnresolvedDecision(
  value: unknown,
  accessedOn: string,
): CampusMapProviderMappingReleaseUnresolvedDecision | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["label", "identity", "evidence", "reason"]) ||
    !nonEmptyText(value.label, 512) ||
    !nonEmptyText(value.reason)
  ) {
    return null;
  }
  const identity = parseIdentity(value.identity);
  const evidence = parseEvidence(value.evidence, accessedOn);
  return identity && evidence
    ? { label: value.label, identity, evidence, reason: value.reason }
    : null;
}

export function parseCampusMapProviderMappingReleaseManifest(
  value: unknown,
):
  | { status: "valid"; manifest: CampusMapProviderMappingReleaseManifest }
  | { status: "invalid"; code: string } {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "manifestVersion",
      "accessedOn",
      "approval",
      "reason",
      "mappings",
      "verifyExisting",
      "unresolved",
    ]) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !nonEmptyText(value.manifestVersion, 200) ||
    !isDate(value.accessedOn) ||
    !nonEmptyText(value.reason) ||
    !Array.isArray(value.mappings) ||
    !Array.isArray(value.verifyExisting) ||
    !Array.isArray(value.unresolved)
  ) {
    return { status: "invalid", code: "invalid-manifest" };
  }
  if (
    !isRecord(value.approval) ||
    !hasExactKeys(value.approval, ["status", "reviewedBy", "reviewedOn"]) ||
    value.approval.status !== "approved" ||
    !nonEmptyText(value.approval.reviewedBy, 512) ||
    !isDate(value.approval.reviewedOn) ||
    value.approval.reviewedOn < value.accessedOn
  ) {
    return { status: "invalid", code: "approval-required" };
  }
  const accessedOn = value.accessedOn;
  const reviewedBy = value.approval.reviewedBy;
  const reviewedOn = value.approval.reviewedOn;

  const mappings = value.mappings.map((decision) =>
    parseMappedDecision(decision, accessedOn),
  );
  const verifyExisting = value.verifyExisting.map((decision) =>
    parseExistingDecision(decision, accessedOn),
  );
  const unresolved = value.unresolved.map((decision) =>
    parseUnresolvedDecision(decision, accessedOn),
  );
  if (
    mappings.some((decision) => decision === null) ||
    verifyExisting.some((decision) => decision === null) ||
    unresolved.some((decision) => decision === null)
  ) {
    return { status: "invalid", code: "invalid-decision" };
  }
  const parsedMappings =
    mappings as CampusMapProviderMappingReleaseMappedDecision[];
  const parsedExisting =
    verifyExisting as CampusMapProviderMappingReleaseExistingDecision[];
  const parsedUnresolved =
    unresolved as CampusMapProviderMappingReleaseUnresolvedDecision[];
  if (
    parsedMappings.length === 0 ||
    !parsedMappings.some((decision) => decision.target.kind === "building")
  ) {
    return { status: "invalid", code: "building-mapping-required" };
  }
  if (
    parsedMappings.some(
      (decision) =>
        Buffer.byteLength(`${value.reason} ${decision.label}`, "utf8") > 2_000,
    )
  ) {
    return { status: "invalid", code: "mapping-reason-too-large" };
  }

  const allDecisions = [
    ...parsedMappings,
    ...parsedExisting,
    ...parsedUnresolved,
  ];
  const labels = allDecisions.map((decision) => decision.label);
  const identities = allDecisions.map((decision) =>
    campusMapProviderIdentityKey(decision.identity),
  );
  const sourceRefs = [...parsedMappings, ...parsedExisting].map(
    (decision) => decision.provenance.sourceRef,
  );
  if (
    new Set(labels).size !== labels.length ||
    new Set(identities).size !== identities.length ||
    new Set(sourceRefs).size !== sourceRefs.length
  ) {
    return { status: "invalid", code: "duplicate-decision" };
  }

  return {
    status: "valid",
    manifest: {
      schemaVersion: SCHEMA_VERSION,
      manifestVersion: value.manifestVersion,
      accessedOn: value.accessedOn,
      approval: {
        status: "approved",
        reviewedBy,
        reviewedOn,
      },
      reason: value.reason,
      mappings: parsedMappings,
      verifyExisting: parsedExisting,
      unresolved: parsedUnresolved,
    },
  };
}

export function campusMapProviderMappingReleaseManifestHash(
  manifest: CampusMapProviderMappingReleaseManifest,
) {
  return createHash("sha256")
    .update(JSON.stringify(manifest), "utf8")
    .digest("hex");
}

export function campusMapProviderMappingReleaseIdempotencyKey(
  manifest: Pick<
    CampusMapProviderMappingReleaseManifest,
    "schemaVersion" | "manifestVersion"
  >,
  identity: CampusMapProviderIdentity,
) {
  const bytes = createHash("sha256")
    .update(
      `${manifest.schemaVersion}\0${manifest.manifestVersion}\0bind\0${campusMapProviderIdentityKey(identity)}`,
      "utf8",
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function provenanceSource(
  decision: CampusMapProviderMappingReleaseMappedDecision,
): CampusMapAppendProvenanceSource {
  return {
    kind: "provider-candidate",
    ref: decision.provenance.sourceRef,
    url: null,
    owner: decision.provenance.sourceOwner,
    version: decision.provenance.sourceVersion,
    snapshotHash: null,
    accessedOn: decision.provenance.accessedOn,
    observedAt:
      decision.provenance.observedAt === null
        ? null
        : new Date(decision.provenance.observedAt),
    rightsStatus: decision.provenance.rightsStatus,
    limitations: decision.provenance.limitations,
    note: decision.provenance.note,
    sourceCoordinateX: null,
    sourceCoordinateY: null,
    sourceCoordinateCrs: null,
    conversionMethod: null,
    conversionVersion: null,
  };
}

function commandResultCode(result: CampusMapProviderMappingCommandResult) {
  if (result.status === "mapped") return `unexpected-${result.outcome}`;
  if (result.status === "validation-failed") {
    return result.errors[0]?.code ?? "validation-failed";
  }
  return result.code;
}

type SuccessfulGovernance = Extract<
  Awaited<ReturnType<CampusMapProviderMappingReleasePorts["governance"]>>,
  { status: "ok" }
>;

function hasCurrentMappingAudit(
  governance: SuccessfulGovernance,
  expectedTarget: CampusMapProviderMappingTarget,
) {
  const event = governance.latestEvent;
  const provenance = governance.activeProvenance;
  return Boolean(
    governance.activeTarget &&
    sameCampusMapProviderMappingTarget(
      governance.activeTarget,
      expectedTarget,
    ) &&
    provenance &&
    event &&
    event.kind !== "unlink" &&
    sameCampusMapProviderMappingTarget(event.newTarget, expectedTarget) &&
    event.provenanceId === provenance.id &&
    isCanonicalCampusMapUuid(event.actor.id) &&
    nonEmptyText(event.actor.nickname, 512) &&
    nonEmptyText(event.reason) &&
    isDateTime(event.occurredAt),
  );
}

function hasReleaseMappingAudit(
  governance: SuccessfulGovernance,
  decision: CampusMapProviderMappingReleaseMappedDecision,
  manifest: CampusMapProviderMappingReleaseManifest,
) {
  return Boolean(
    hasCurrentMappingAudit(governance, decision.target) &&
    hasExpectedProvenance(governance, decision.provenance) &&
    governance.latestEvent?.reason === `${manifest.reason} ${decision.label}`,
  );
}

function hasExpectedProvenance(
  governance: SuccessfulGovernance,
  expected: CampusMapProviderMappingReleaseProvenance,
) {
  const activeProvenance = governance.activeProvenance;
  const expectedObservedAt =
    expected.observedAt === null
      ? null
      : new Date(expected.observedAt).toISOString();
  return Boolean(
    activeProvenance?.kind === "provider-candidate" &&
    activeProvenance.ref === expected.sourceRef &&
    activeProvenance.owner === expected.sourceOwner &&
    activeProvenance.version === expected.sourceVersion &&
    activeProvenance.accessedOn === expected.accessedOn &&
    activeProvenance.observedAt === expectedObservedAt &&
    activeProvenance.rightsStatus === expected.rightsStatus &&
    activeProvenance.limitations === expected.limitations &&
    activeProvenance.note === expected.note,
  );
}

function hasExistingMappingAudit(
  governance: SuccessfulGovernance,
  decision: CampusMapProviderMappingReleaseExistingDecision,
) {
  return Boolean(
    hasCurrentMappingAudit(governance, decision.target) &&
    hasExpectedProvenance(governance, decision.provenance),
  );
}

export async function runCampusMapProviderMappingRelease(
  manifest: CampusMapProviderMappingReleaseManifest,
  action: CampusMapProviderMappingReleaseAction,
  ports: CampusMapProviderMappingReleasePorts,
): Promise<CampusMapProviderMappingReleaseResult> {
  const activeTargets = new Map<
    string,
    CampusMapProviderMappingTarget | null
  >();
  const expectations = [
    ...manifest.mappings.map((decision) => ({
      ...decision,
      role: "mapping" as const,
      expectedTarget: decision.target,
    })),
    ...manifest.verifyExisting.map((decision) => ({
      ...decision,
      role: "existing" as const,
      expectedTarget: decision.target,
    })),
    ...manifest.unresolved.map((decision) => ({
      ...decision,
      role: "unresolved" as const,
      expectedTarget: null,
    })),
  ];

  for (const decision of expectations) {
    const governance = await ports.governance(decision.identity);
    if (governance.status === "failed") {
      return {
        status: "failed",
        stage: "preflight",
        label: decision.label,
        code: governance.code,
      };
    }
    if (
      governance.activeTarget !== null &&
      !sameCampusMapProviderMappingTarget(
        governance.activeTarget,
        decision.expectedTarget,
      )
    ) {
      return {
        status: "failed",
        stage: "preflight",
        label: decision.label,
        code:
          decision.role === "unresolved"
            ? "expected-unresolved-provider-object"
            : "different-active-target",
      };
    }
    if (
      governance.activeTarget === null &&
      (decision.role === "existing" ||
        (decision.role === "mapping" && action === "verify"))
    ) {
      return {
        status: "failed",
        stage: "preflight",
        label: decision.label,
        code:
          decision.role === "existing"
            ? "expected-existing-target"
            : "expected-released-target",
      };
    }
    if (
      governance.activeTarget !== null &&
      decision.role === "mapping" &&
      !hasReleaseMappingAudit(governance, decision, manifest)
    ) {
      return {
        status: "failed",
        stage: "preflight",
        label: decision.label,
        code: "mapping-release-audit-missing",
      };
    }
    if (
      governance.activeTarget !== null &&
      decision.role === "existing" &&
      !hasExistingMappingAudit(governance, decision)
    ) {
      return {
        status: "failed",
        stage: "preflight",
        label: decision.label,
        code: "mapping-audit-missing",
      };
    }
    activeTargets.set(
      campusMapProviderIdentityKey(decision.identity),
      governance.activeTarget,
    );
  }

  for (const decision of [...manifest.mappings, ...manifest.verifyExisting]) {
    if ((await ports.validateTarget(decision.target)) !== "valid") {
      return {
        status: "failed",
        stage: "preflight",
        label: decision.label,
        code: "mapping-target-not-found",
      };
    }
  }

  const missingMappings =
    action === "apply"
      ? manifest.mappings.filter(
          (decision) =>
            activeTargets.get(
              campusMapProviderIdentityKey(decision.identity),
            ) === null,
        )
      : [];
  let changed = 0;
  if (missingMappings.length > 0) {
    const provenance = await ports.resolveProvenance(
      missingMappings.map((decision) => provenanceSource(decision)),
    );
    if (provenance.status === "failed") {
      return {
        status: "failed",
        stage: "provenance",
        label: "manifest",
        code: provenance.code,
      };
    }
    if (
      provenance.provenanceIds.length !== missingMappings.length ||
      provenance.provenanceIds.some(
        (provenanceId) => !isCanonicalCampusMapUuid(provenanceId),
      )
    ) {
      return {
        status: "failed",
        stage: "provenance",
        label: "manifest",
        code: "invalid-provenance-result",
      };
    }
    for (const [index, decision] of missingMappings.entries()) {
      const result = await ports.command({
        kind: "bind",
        idempotencyKey: campusMapProviderMappingReleaseIdempotencyKey(
          manifest,
          decision.identity,
        ),
        identity: decision.identity,
        target: decision.target,
        reason: `${manifest.reason} ${decision.label}`,
        provenanceId: provenance.provenanceIds[index]!,
      });
      if (
        result.status !== "mapped" ||
        (result.outcome !== "bound" && result.outcome !== "unchanged")
      ) {
        return {
          status: "failed",
          stage: "command",
          label: decision.label,
          code: commandResultCode(result),
        };
      }
      if (result.outcome === "bound") changed += 1;
    }
  }

  for (const decision of expectations) {
    const resolved = await ports.resolve(decision.identity);
    if (
      !sameCampusMapProviderMappingTarget(resolved, decision.expectedTarget)
    ) {
      return {
        status: "failed",
        stage: "verify",
        label: decision.label,
        code:
          decision.role === "unresolved"
            ? "expected-unresolved-provider-object"
            : "unexpected-public-target",
      };
    }
  }

  const auditExpectations = [
    ...manifest.mappings.map((decision) => ({
      ...decision,
      role: "mapping" as const,
    })),
    ...manifest.verifyExisting.map((decision) => ({
      ...decision,
      role: "existing" as const,
    })),
  ];
  for (const decision of auditExpectations) {
    const governance = await ports.governance(decision.identity);
    if (governance.status === "failed") {
      return {
        status: "failed",
        stage: "verify",
        label: decision.label,
        code: governance.code,
      };
    }
    const auditMatches =
      decision.role === "mapping"
        ? hasReleaseMappingAudit(governance, decision, manifest)
        : hasExistingMappingAudit(governance, decision);
    if (!auditMatches) {
      return {
        status: "failed",
        stage: "verify",
        label: decision.label,
        code:
          decision.role === "mapping"
            ? "mapping-release-audit-missing"
            : "mapping-audit-missing",
      };
    }
  }

  return {
    status: "ok",
    action,
    changed,
    verified: expectations.length,
    mappings: manifest.mappings.length,
    verifiedExisting: manifest.verifyExisting.length,
    unresolved: manifest.unresolved.length,
  };
}
