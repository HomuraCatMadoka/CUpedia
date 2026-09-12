import { createHash } from "node:crypto";

import type {
  CampusMapPublishCommand,
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
  CampusMapPublishValidationIssue,
} from "@/lib/campus-map/publish-contract";
import {
  analyzeSourceIdentities,
  validateChangeIdentities,
  validateChangesetMetadata,
  validateComment,
  validateFact,
  validateSource,
} from "@/lib/campus-map/publish-command";

export const CAMPUS_MAP_OFFICIAL_FACILITY_MANIFEST_SCHEMA =
  "cuhk-campus-map-official-facilities/1";
export const CAMPUS_MAP_OFFICIAL_FACILITY_RES_EXPECTED_COUNT = 257;
export const CAMPUS_MAP_OFFICIAL_FACILITY_CHUNK_LIMIT = 25;

const RES_URL =
  "https://www.res.cuhk.edu.hk/teaching-timetable-classroom-booking/classroom-booking/list-of-communal-classrooms/";
const OSA_AMENITIES_URL = "https://www.osa.cuhk.edu.hk/campus-life/amenities/";
const UMSO_BASE_URL = "https://www.umso.cuhk.edu.hk/";

export const CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS = {
  "res-classrooms": RES_URL,
  "osa-amenities": OSA_AMENITIES_URL,
  "osa-swimming-pool": `${OSA_AMENITIES_URL}swimming-pool/`,
  "osa-bfc": `${OSA_AMENITIES_URL}benjamin-franklin-centre/`,
  "osa-jfc": `${OSA_AMENITIES_URL}john-fulton-centre/`,
  "osa-psc": `${OSA_AMENITIES_URL}pommerenke-student-centre/`,
  "osa-i-lounge": `${OSA_AMENITIES_URL}i-lounge/`,
  "osa-pgh-2-3": `${OSA_AMENITIES_URL}jockey-club-postgraduate-halls-2-3/`,
  "umso-home": UMSO_BASE_URL,
  "umso-location": `${UMSO_BASE_URL}location-of-umso/`,
  "umso-medical": `${UMSO_BASE_URL}medical-service/`,
  "umso-dental": `${UMSO_BASE_URL}dental-service/`,
  "umso-contact": `${UMSO_BASE_URL}contact-us/`,
} as const;

export type CampusMapOfficialFacilitySourceGroup = "res" | "osa" | "umso";
export type CampusMapOfficialFacilityBatch = "canary" | "res";

export interface CampusMapOfficialFacilitySourceSnapshot {
  key: string;
  url: string;
  rawSha256: string;
  semanticSha256: string;
}

export interface CampusMapOfficialFacilityBuildingMapping {
  sourceGroup: CampusMapOfficialFacilitySourceGroup;
  sourceLabel: string;
  canonicalBuildingId: string;
  canonicalBuildingName: string;
  evidenceUrl: string;
  note: string;
}

export interface CampusMapOfficialFacilityExtractedFact {
  name: string;
  sourceLocation: string | null;
  sourceFloor: string | null;
  capacity: number | null;
  seatType: string | null;
  ordinaryHours: string | null;
  officialUrl: string;
}

export type CampusMapOfficialFacilityReviewDecision =
  | {
      status: "publish";
      reason: string;
      buildingId: string | null;
      floorId: string | null;
      containmentEvidence: string;
    }
  | {
      status: "intentionally-skip";
      reason: string;
    };

export interface CampusMapOfficialFacilityManifestEntry {
  key: string;
  batch: CampusMapOfficialFacilityBatch;
  sourceGroup: CampusMapOfficialFacilitySourceGroup;
  sourceSnapshotKey: string;
  sourceRef: string;
  extracted: CampusMapOfficialFacilityExtractedFact;
  decision: CampusMapOfficialFacilityReviewDecision;
  fact: CampusMapPublishFactInput | null;
  sources: CampusMapPublishSourceInput[];
}

export interface CampusMapOfficialFacilityManifestApproval {
  status: "pending" | "approved";
  reviewedBy: string | null;
  reviewedOn: string | null;
}

export interface CampusMapOfficialFacilityManifest {
  schemaVersion: typeof CAMPUS_MAP_OFFICIAL_FACILITY_MANIFEST_SCHEMA;
  manifestVersion: string;
  parserVersion: string;
  accessedOn: string;
  approval: CampusMapOfficialFacilityManifestApproval;
  resExpectedCount: number;
  resLiveCount: number;
  sourceSnapshots: CampusMapOfficialFacilitySourceSnapshot[];
  buildingMappings: CampusMapOfficialFacilityBuildingMapping[];
  entries: CampusMapOfficialFacilityManifestEntry[];
  manifestHash: string;
}

export type CampusMapOfficialFacilityManifestDraft = Omit<
  CampusMapOfficialFacilityManifest,
  "manifestHash"
>;

export interface CampusMapOfficialFacilityManifestValidation {
  status: "valid" | "invalid";
  errors: string[];
}

export interface CampusMapOfficialFacilityChunk {
  batch: CampusMapOfficialFacilityBatch;
  index: number;
  key: string;
  entries: CampusMapOfficialFacilityManifestEntry[];
}

export interface CampusMapOfficialFacilityUpdateTarget {
  sourceRef: string;
  placeId: string;
  baseRevisionId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validExtractedOfficialUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && url.hostname === "www.avsu.cuhk.edu.hk")
    );
  } catch {
    return false;
  }
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson(value[key])]),
  );
}

export function canonicalCampusMapOfficialFacilityJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function campusMapOfficialFacilitySha256(
  value: string | Uint8Array,
): string {
  return createHash("sha256").update(value).digest("hex");
}

export function campusMapOfficialFacilityManifestHash(
  manifest: Omit<CampusMapOfficialFacilityManifest, "manifestHash">,
): string {
  return campusMapOfficialFacilitySha256(
    canonicalCampusMapOfficialFacilityJson(manifest),
  );
}

export function finalizeCampusMapOfficialFacilityManifest(
  draft: CampusMapOfficialFacilityManifestDraft,
): CampusMapOfficialFacilityManifest {
  const stableDraft = structuredClone(draft);
  return {
    ...stableDraft,
    manifestHash: campusMapOfficialFacilityManifestHash(stableDraft),
  };
}

export function approveCampusMapOfficialFacilityManifest(
  manifest: CampusMapOfficialFacilityManifest,
  reviewedBy: string,
  reviewedOn: string,
): CampusMapOfficialFacilityManifest {
  const existingDraft = structuredClone(manifest);
  delete (existingDraft as Partial<CampusMapOfficialFacilityManifest>)
    .manifestHash;
  const draft: CampusMapOfficialFacilityManifestDraft = {
    ...existingDraft,
    approval: {
      status: "approved",
      reviewedBy: reviewedBy.trim(),
      reviewedOn,
    },
  };
  return finalizeCampusMapOfficialFacilityManifest(draft);
}

function validDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function topLevelShapeLooksValid(
  value: unknown,
): value is CampusMapOfficialFacilityManifest {
  return (
    isRecord(value) &&
    value.schemaVersion === CAMPUS_MAP_OFFICIAL_FACILITY_MANIFEST_SCHEMA &&
    typeof value.manifestVersion === "string" &&
    typeof value.parserVersion === "string" &&
    isRecord(value.approval) &&
    Array.isArray(value.sourceSnapshots) &&
    Array.isArray(value.buildingMappings) &&
    Array.isArray(value.entries) &&
    typeof value.manifestHash === "string"
  );
}

function publishEntryShapeLooksValid(
  value: unknown,
): value is CampusMapOfficialFacilityManifestEntry {
  if (
    !isRecord(value) ||
    !isRecord(value.extracted) ||
    !isRecord(value.decision)
  ) {
    return false;
  }
  if (
    typeof value.key !== "string" ||
    (value.batch !== "canary" && value.batch !== "res") ||
    (value.sourceGroup !== "res" &&
      value.sourceGroup !== "osa" &&
      value.sourceGroup !== "umso") ||
    typeof value.sourceSnapshotKey !== "string" ||
    typeof value.sourceRef !== "string" ||
    !Array.isArray(value.sources) ||
    typeof value.extracted.name !== "string" ||
    (value.extracted.sourceLocation !== null &&
      typeof value.extracted.sourceLocation !== "string") ||
    (value.extracted.sourceFloor !== null &&
      typeof value.extracted.sourceFloor !== "string") ||
    (value.extracted.capacity !== null &&
      (!Number.isSafeInteger(value.extracted.capacity) ||
        (value.extracted.capacity as number) <= 0)) ||
    (value.extracted.seatType !== null &&
      typeof value.extracted.seatType !== "string") ||
    (value.extracted.ordinaryHours !== null &&
      typeof value.extracted.ordinaryHours !== "string") ||
    typeof value.extracted.officialUrl !== "string" ||
    !validExtractedOfficialUrl(value.extracted.officialUrl)
  ) {
    return false;
  }
  if (value.decision.status === "intentionally-skip") {
    return (
      typeof value.decision.reason === "string" &&
      value.fact === null &&
      value.sources.length === 0
    );
  }
  if (value.decision.status !== "publish") {
    return false;
  }
  return (
    typeof value.decision.reason === "string" &&
    (value.decision.buildingId === null ||
      typeof value.decision.buildingId === "string") &&
    (value.decision.floorId === null ||
      typeof value.decision.floorId === "string") &&
    typeof value.decision.containmentEvidence === "string" &&
    isRecord(value.fact)
  );
}

function issueCode(issue: CampusMapPublishValidationIssue): string {
  const suffix = [
    issue.anchor.changeIndex,
    issue.anchor.placeId,
    issue.anchor.field,
  ]
    .filter((part) => part !== undefined)
    .join(":");
  return suffix ? `${issue.code}:${suffix}` : issue.code;
}

function validateManifestEntry(
  entry: CampusMapOfficialFacilityManifestEntry,
  index: number,
): string[] {
  const errors: string[] = [];
  const prefix = `entries.${index}`;
  if (!entry.key.trim()) errors.push(`${prefix}.key-required`);
  if (!entry.sourceSnapshotKey.trim()) {
    errors.push(`${prefix}.source-snapshot-key-required`);
  }
  if (!entry.sourceRef.trim()) errors.push(`${prefix}.source-ref-required`);
  if (
    !entry.extracted.name.trim() ||
    (typeof entry.extracted.sourceLocation === "string" &&
      !entry.extracted.sourceLocation.trim()) ||
    (typeof entry.extracted.sourceFloor === "string" &&
      !entry.extracted.sourceFloor.trim()) ||
    (typeof entry.extracted.seatType === "string" &&
      !entry.extracted.seatType.trim()) ||
    (typeof entry.extracted.ordinaryHours === "string" &&
      !entry.extracted.ordinaryHours.trim())
  ) {
    errors.push(`${prefix}.invalid-extracted-fact`);
  }
  if (
    entry.sourceGroup === "res" &&
    (entry.extracted.sourceLocation === null ||
      entry.extracted.capacity === null ||
      entry.extracted.seatType === null)
  ) {
    errors.push(`${prefix}.incomplete-res-review-fact`);
  }

  if (entry.decision.status === "intentionally-skip") {
    if (!entry.decision.reason.trim()) {
      errors.push(`${prefix}.skip-reason-required`);
    }
    if (entry.fact !== null || entry.sources.length !== 0) {
      errors.push(`${prefix}.skipped-entry-must-not-publish`);
    }
    return errors;
  }

  if (
    !entry.decision.reason.trim() ||
    !entry.decision.containmentEvidence.trim()
  ) {
    errors.push(`${prefix}.publish-review-required`);
  }
  if (entry.fact === null || !isRecord(entry.fact)) {
    errors.push(`${prefix}.publish-fact-required`);
    return errors;
  }
  if (entry.sources.length === 0 || !entry.sources.every(isRecord)) {
    errors.push(`${prefix}.publish-source-required`);
    return errors;
  }
  if (entry.sources[0]?.ref !== entry.sourceRef) {
    errors.push(`${prefix}.identity-source-must-be-first`);
  }
  if (
    entry.fact.buildingId !== entry.decision.buildingId ||
    entry.fact.floorId !== entry.decision.floorId
  ) {
    errors.push(`${prefix}.reviewed-containment-mismatch`);
  }
  errors.push(
    ...validateFact(entry.fact, index).map(
      (issue) => `${prefix}.${issueCode(issue)}`,
    ),
  );
  for (const [sourceIndex, source] of entry.sources.entries()) {
    errors.push(
      ...validateSource(source, index, sourceIndex).map(
        (issue) => `${prefix}.${issueCode(issue)}`,
      ),
    );
  }
  return errors;
}

export function validateCampusMapOfficialFacilityManifest(
  value: unknown,
  options: { requireApproval?: boolean } = {},
): CampusMapOfficialFacilityManifestValidation {
  if (!topLevelShapeLooksValid(value)) {
    return { status: "invalid", errors: ["invalid-manifest-shape"] };
  }
  const manifest = value;
  const errors: string[] = [];
  if (!manifest.manifestVersion.trim() || !manifest.parserVersion.trim()) {
    errors.push("manifest-version-required");
  }
  if (!validDateOnly(manifest.accessedOn)) errors.push("invalid-accessed-on");
  if (
    manifest.approval.status !== "pending" &&
    manifest.approval.status !== "approved"
  ) {
    errors.push("invalid-approval-status");
  }
  if (manifest.approval.status === "approved") {
    if (
      typeof manifest.approval.reviewedBy !== "string" ||
      !manifest.approval.reviewedBy.trim() ||
      !validDateOnly(manifest.approval.reviewedOn)
    ) {
      errors.push("invalid-approval-evidence");
    } else if (manifest.approval.reviewedOn < manifest.accessedOn) {
      errors.push("approval-predates-source-access");
    }
  } else if (
    manifest.approval.reviewedBy !== null ||
    manifest.approval.reviewedOn !== null
  ) {
    errors.push("pending-approval-must-be-empty");
  }
  if (options.requireApproval && manifest.approval.status !== "approved") {
    errors.push("manifest-not-approved");
  }
  if (
    manifest.resExpectedCount !==
      CAMPUS_MAP_OFFICIAL_FACILITY_RES_EXPECTED_COUNT ||
    manifest.resLiveCount !== manifest.resExpectedCount
  ) {
    errors.push("res-count-drift");
  }

  const snapshots = new Map<string, CampusMapOfficialFacilitySourceSnapshot>();
  for (const [index, snapshot] of manifest.sourceSnapshots.entries()) {
    if (
      !isRecord(snapshot) ||
      typeof snapshot.key !== "string" ||
      !snapshot.key.trim() ||
      typeof snapshot.url !== "string" ||
      !snapshot.url.startsWith("https://") ||
      !validSha256(snapshot.rawSha256) ||
      !validSha256(snapshot.semanticSha256)
    ) {
      errors.push(`sourceSnapshots.${index}.invalid`);
      continue;
    }
    if (snapshots.has(snapshot.key)) {
      errors.push(`sourceSnapshots.${index}.duplicate-key`);
    }
    snapshots.set(snapshot.key, snapshot);
  }
  const allowedSources = new Map(
    Object.entries(CAMPUS_MAP_OFFICIAL_FACILITY_SOURCE_URLS),
  );
  if (
    snapshots.size !== allowedSources.size ||
    [...allowedSources].some(([key, url]) => snapshots.get(key)?.url !== url)
  ) {
    errors.push("source-snapshot-allowlist-mismatch");
  }

  const mappingKeys = new Set<string>();
  for (const [index, mapping] of manifest.buildingMappings.entries()) {
    if (
      !isRecord(mapping) ||
      (mapping.sourceGroup !== "res" &&
        mapping.sourceGroup !== "osa" &&
        mapping.sourceGroup !== "umso") ||
      typeof mapping.sourceLabel !== "string" ||
      !mapping.sourceLabel.trim() ||
      typeof mapping.canonicalBuildingId !== "string" ||
      typeof mapping.canonicalBuildingName !== "string" ||
      !mapping.canonicalBuildingName.trim() ||
      typeof mapping.evidenceUrl !== "string" ||
      !mapping.evidenceUrl.startsWith("https://") ||
      typeof mapping.note !== "string" ||
      !mapping.note.trim()
    ) {
      errors.push(`buildingMappings.${index}.invalid`);
      continue;
    }
    const key = `${mapping.sourceGroup}:${mapping.sourceLabel}`;
    if (mappingKeys.has(key)) {
      errors.push(`buildingMappings.${index}.duplicate`);
    }
    mappingKeys.add(key);
  }

  const entries: CampusMapOfficialFacilityManifestEntry[] = [];
  for (const [index, entry] of manifest.entries.entries()) {
    if (!publishEntryShapeLooksValid(entry)) {
      errors.push(`entries.${index}.invalid-shape`);
      continue;
    }
    entries.push(entry);
    errors.push(...validateManifestEntry(entry, index));
    const snapshot = snapshots.get(entry.sourceSnapshotKey);
    if (!snapshot) {
      errors.push(`entries.${index}.unknown-source-snapshot`);
    } else if (
      entry.decision.status === "publish" &&
      !entry.sources.some(
        (source) =>
          source.url === snapshot.url &&
          source.snapshotHash === `sha256:${snapshot.rawSha256}`,
      )
    ) {
      errors.push(`entries.${index}.snapshot-evidence-mismatch`);
    }
    if (entry.sourceGroup === "res" && entry.batch !== "res") {
      errors.push(`entries.${index}.res-batch-mismatch`);
    }
    if (entry.sourceGroup !== "res" && entry.batch !== "canary") {
      errors.push(`entries.${index}.canary-batch-mismatch`);
    }
  }

  const entryKeys = entries.map((entry) => entry.key);
  const sourceRefs = entries
    .filter((entry) => entry.decision.status === "publish")
    .map((entry) => entry.sourceRef);
  if (new Set(entryKeys).size !== entryKeys.length) {
    errors.push("duplicate-entry-key");
  }
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    errors.push("duplicate-identity-source-ref");
  }
  const resEntries = entries.filter((entry) => entry.sourceGroup === "res");
  if (resEntries.length !== manifest.resLiveCount) {
    errors.push("res-rows-not-fully-represented");
  }
  if (
    resEntries.some((entry) => entry.decision.status !== "publish") ||
    entries.some(
      (entry) =>
        entry.decision.status !== "publish" &&
        entry.decision.status !== "intentionally-skip",
    )
  ) {
    errors.push("required-row-unmatched");
  }

  const publishChanges = entries.flatMap((entry) =>
    entry.decision.status === "publish" && entry.fact
      ? [
          {
            operation: "create" as const,
            fact: entry.fact,
            sources: entry.sources,
          },
        ]
      : [],
  );
  const validationCommand: CampusMapPublishCommand = {
    kind: "bulk",
    idempotencyKey: "86700000-0000-5000-8000-000000000001",
    comment: "预检 CUHK 官方设施 manifest",
    sourceSummary: "CUHK RES、OSA 与 UMSO 官方短事实",
    reviewRequested: false,
    client: {
      name: "campus-map-official-facility-import",
      version: manifest.manifestVersion,
    },
    warningAcknowledgements: [],
    changes: publishChanges,
  };
  errors.push(
    ...validateComment(validationCommand.comment).map(issueCode),
    ...validateChangesetMetadata(validationCommand).map(issueCode),
    ...validateChangeIdentities(validationCommand).map(issueCode),
    ...analyzeSourceIdentities(validationCommand).errors.map(issueCode),
  );

  const draft = structuredClone(manifest);
  delete (draft as Partial<CampusMapOfficialFacilityManifest>).manifestHash;
  if (
    !validSha256(manifest.manifestHash) ||
    campusMapOfficialFacilityManifestHash(draft) !== manifest.manifestHash
  ) {
    errors.push("manifest-hash-mismatch");
  }
  return {
    status: errors.length === 0 ? "valid" : "invalid",
    errors: [...new Set(errors)],
  };
}

export function parseCampusMapOfficialFacilityManifest(
  value: unknown,
  options: { requireApproval?: boolean } = {},
):
  | { status: "valid"; manifest: CampusMapOfficialFacilityManifest }
  | { status: "invalid"; errors: string[] } {
  const validation = validateCampusMapOfficialFacilityManifest(value, options);
  return validation.status === "valid"
    ? {
        status: "valid",
        manifest: structuredClone(value) as CampusMapOfficialFacilityManifest,
      }
    : { status: "invalid", errors: validation.errors };
}

export function chunkCampusMapOfficialFacilityManifest(
  manifest: CampusMapOfficialFacilityManifest,
): CampusMapOfficialFacilityChunk[] {
  const chunks: CampusMapOfficialFacilityChunk[] = [];
  for (const batch of ["canary", "res"] as const) {
    const entries = manifest.entries
      .filter(
        (entry) => entry.batch === batch && entry.decision.status === "publish",
      )
      .toSorted((left, right) => left.sourceRef.localeCompare(right.sourceRef));
    for (
      let offset = 0;
      offset < entries.length;
      offset += CAMPUS_MAP_OFFICIAL_FACILITY_CHUNK_LIMIT
    ) {
      const index = offset / CAMPUS_MAP_OFFICIAL_FACILITY_CHUNK_LIMIT;
      chunks.push({
        batch,
        index,
        key: `${batch}-${String(index + 1).padStart(2, "0")}`,
        entries: entries.slice(
          offset,
          offset + CAMPUS_MAP_OFFICIAL_FACILITY_CHUNK_LIMIT,
        ),
      });
    }
  }
  return chunks;
}

function deterministicUuid(seed: string): string {
  const bytes = createHash("sha256")
    .update(seed, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable IDs let the reviewed manifest refer to Floors installed by migration. */
export function campusMapOfficialFacilityFloorId(
  buildingId: string,
  displayLabel: string,
): string {
  return deterministicUuid(
    `cuhk-campus-map-floor-directory/1\n${buildingId}\n${displayLabel.toLowerCase()}`,
  );
}

export function buildCampusMapOfficialFacilityChunkCommand(
  manifest: CampusMapOfficialFacilityManifest,
  chunk: CampusMapOfficialFacilityChunk,
  entries: readonly CampusMapOfficialFacilityManifestEntry[] = chunk.entries,
  updateTargets: readonly CampusMapOfficialFacilityUpdateTarget[] = [],
): CampusMapPublishCommand {
  if (
    entries.length === 0 ||
    entries.length > CAMPUS_MAP_OFFICIAL_FACILITY_CHUNK_LIMIT
  ) {
    throw new Error(
      "Official facility chunk must contain between 1 and 25 entries",
    );
  }
  const updateTargetsBySourceRef = new Map(
    updateTargets.map((target) => [target.sourceRef, target]),
  );
  const changes = entries.map((entry) => {
    if (entry.decision.status !== "publish" || entry.fact === null) {
      throw new Error(`Official facility ${entry.key} is not publishable`);
    }
    const updateTarget = updateTargetsBySourceRef.get(entry.sourceRef);
    return updateTarget
      ? {
          operation: "update" as const,
          placeId: updateTarget.placeId,
          baseRevisionId: updateTarget.baseRevisionId,
          fact: structuredClone(entry.fact),
          // The stable identity source already exists and its metadata is
          // immutable. The new snapshot is sufficient provenance for this
          // revision; source history still resolves the Place by identity.
          sources: structuredClone(
            entry.sources.filter((source) => source.ref !== entry.sourceRef),
          ),
        }
      : {
          operation: "create" as const,
          fact: structuredClone(entry.fact),
          sources: structuredClone(entry.sources),
        };
  });
  const identity = entries.map((entry) => entry.sourceRef).join("\n");
  return {
    kind: changes.length === 1 ? "single" : "bulk",
    idempotencyKey: deterministicUuid(
      `${manifest.manifestHash}\n${chunk.key}\n${identity}`,
    ),
    comment:
      chunk.batch === "canary"
        ? `导入 CUHK OSA/UMSO 官方设施（${chunk.key}；manifest sha256:${manifest.manifestHash}）`
        : `导入 CUHK RES 公用课室（${chunk.key}；manifest sha256:${manifest.manifestHash}）`,
    sourceSummary:
      chunk.batch === "canary"
        ? "人工核对的 CUHK OSA 与 UMSO 官方短事实"
        : "人工核对的 CUHK RES 公用课室清单",
    reviewRequested: false,
    client: {
      name: "campus-map-official-facility-import",
      version: manifest.manifestVersion,
    },
    warningAcknowledgements: [],
    changes,
  };
}
