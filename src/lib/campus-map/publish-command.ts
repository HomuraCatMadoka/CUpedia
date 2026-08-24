import {
  CAMPUS_MAP_AUDIENCES,
  CAMPUS_MAP_CAPABILITIES,
  CAMPUS_MAP_COORDINATE_CONVERSION_METHODS,
  CAMPUS_MAP_CREDENTIAL_REQUIREMENTS,
  CAMPUS_MAP_FACT_SCHEMA_V1,
  CAMPUS_MAP_GENDERS,
  CAMPUS_MAP_PIN_TYPES,
  CAMPUS_MAP_SOURCE_COORDINATE_CRS,
  CAMPUS_MAP_WHEELCHAIR_ACCESS,
  type CampusMapProvenanceKind,
} from "@/db/schema";
import type {
  CampusMapAppendFact,
  CampusMapAppendProvenanceSource,
} from "@/lib/campus-map/fact-store-transaction";
import type {
  CampusMapPublishCommand,
  CampusMapPublishFactInput,
  CampusMapPublishIssueAnchor,
  CampusMapPublishResult,
  CampusMapPublishSourceInput,
  CampusMapPublishValidationIssue,
} from "@/lib/campus-map/publish-contract";

const MAX_COMMENT_BYTES = 2_000;
const MAX_SOURCE_SUMMARY_BYTES = 2_000;
const MAX_CLIENT_NAME_BYTES = 120;
const MAX_CLIENT_VERSION_BYTES = 120;
const MAX_WARNING_CODE_BYTES = 120;
const MAX_WARNING_ACKNOWLEDGEMENTS = 25;
const MAX_SINGLE_COMMAND_BYTES = 32 * 1_024;
const MAX_BULK_COMMAND_BYTES = 512 * 1_024;
const MAX_FACT_NAME_BYTES = 240;
const MAX_SOURCE_REF_BYTES = 512;
const MAX_SOURCE_URL_BYTES = 2_048;
const MAX_SOURCE_OWNER_BYTES = 240;
const MAX_SOURCE_VERSION_BYTES = 160;
const MAX_SOURCE_HASH_BYTES = 256;
const MAX_SOURCE_TEXT_BYTES = 2_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalUuid<T>(value: T): T {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? (value.toLowerCase() as T)
    : value;
}

/** Normalizes UUID identity once before fingerprinting or domain comparisons. */
export function normalizePublishCommandIdentifiers(
  command: CampusMapPublishCommand,
): CampusMapPublishCommand {
  return {
    ...command,
    idempotencyKey: canonicalUuid(command.idempotencyKey),
    changes: command.changes.map((change) => {
      if (change.operation === "create") {
        return {
          ...change,
          fact: {
            ...change.fact,
            buildingId: canonicalUuid(change.fact.buildingId),
            floorId: canonicalUuid(change.fact.floorId),
          },
        };
      }
      if (change.operation === "retire") {
        return {
          ...change,
          placeId: canonicalUuid(change.placeId),
          baseRevisionId: canonicalUuid(change.baseRevisionId),
        };
      }
      if (change.operation === "update" || change.operation === "restore") {
        return {
          ...change,
          placeId: canonicalUuid(change.placeId),
          baseRevisionId: canonicalUuid(change.baseRevisionId),
          fact: {
            ...change.fact,
            buildingId: canonicalUuid(change.fact.buildingId),
            floorId: canonicalUuid(change.fact.floorId),
          },
        };
      }
      return change;
    }),
  };
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function containsUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function containsInvalidPostgresText(value: string): boolean {
  return value.includes("\u0000") || containsUnpairedSurrogate(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasPublishCommandStructure(
  command: unknown,
): command is CampusMapPublishCommand {
  if (!isRecord(command)) return false;
  if (
    !Array.isArray(command.changes) ||
    !Array.isArray(command.warningAcknowledgements) ||
    !isRecord(command.client)
  ) {
    return false;
  }
  return command.changes.every((change) => {
    if (!isRecord(change) || !Array.isArray(change.sources)) return false;
    if (!change.sources.every(isRecord)) return false;
    return change.operation === "retire" || isRecord(change.fact);
  });
}

export function invalidCommandResult(): Extract<
  CampusMapPublishResult,
  { status: "validation-failed" }
> {
  return {
    status: "validation-failed",
    errors: [{ code: "invalid-command", anchor: { field: "command" } }],
    warnings: [],
    suggestions: [],
  };
}

export function isPublishCommandTooLarge(
  serializedCommand: string,
  kind: CampusMapPublishCommand["kind"],
): boolean {
  const limit =
    kind === "bulk" ? MAX_BULK_COMMAND_BYTES : MAX_SINGLE_COMMAND_BYTES;
  return utf8Bytes(serializedCommand) > limit;
}

export function isValidPublishIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateComment(
  comment: unknown,
): CampusMapPublishValidationIssue[] {
  if (typeof comment !== "string" || comment.trim() === "") {
    return [{ code: "comment-required", anchor: { field: "comment" } }];
  }
  if (containsInvalidPostgresText(comment)) {
    return [{ code: "comment-invalid", anchor: { field: "comment" } }];
  }
  return utf8Bytes(comment) > MAX_COMMENT_BYTES
    ? [{ code: "comment-too-long", anchor: { field: "comment" } }]
    : [];
}

export function validateChangesetMetadata(
  command: CampusMapPublishCommand,
): CampusMapPublishValidationIssue[] {
  const errors: CampusMapPublishValidationIssue[] = [];
  if (command.kind !== "single" && command.kind !== "bulk") {
    errors.push({ code: "invalid-command-kind", anchor: { field: "kind" } });
  }
  if (
    typeof command.sourceSummary !== "string" ||
    command.sourceSummary.trim() === ""
  ) {
    errors.push({
      code: "source-summary-required",
      anchor: { field: "sourceSummary" },
    });
  } else if (containsInvalidPostgresText(command.sourceSummary)) {
    errors.push({
      code: "source-summary-invalid",
      anchor: { field: "sourceSummary" },
    });
  } else if (utf8Bytes(command.sourceSummary) > MAX_SOURCE_SUMMARY_BYTES) {
    errors.push({
      code: "source-summary-too-long",
      anchor: { field: "sourceSummary" },
    });
  }
  validateRequiredMetadataText(
    errors,
    command.client.name,
    MAX_CLIENT_NAME_BYTES,
    "client-name-required",
    "client-name-invalid",
    "client-name-too-long",
    "client.name",
  );
  validateRequiredMetadataText(
    errors,
    command.client.version,
    MAX_CLIENT_VERSION_BYTES,
    "client-version-required",
    "client-version-invalid",
    "client-version-too-long",
    "client.version",
  );
  if (typeof command.reviewRequested !== "boolean") {
    errors.push({
      code: "invalid-review-requested",
      anchor: { field: "reviewRequested" },
    });
  }
  if (command.warningAcknowledgements.length > MAX_WARNING_ACKNOWLEDGEMENTS) {
    errors.push({
      code: "warning-acknowledgement-limit-exceeded",
      anchor: { field: "warningAcknowledgements" },
    });
  }
  for (const acknowledgement of command.warningAcknowledgements) {
    const record = isRecord(acknowledgement) ? acknowledgement : null;
    const changeIndex = record?.changeIndex;
    if (
      !record ||
      !Number.isInteger(changeIndex) ||
      (changeIndex as number) < 0 ||
      (changeIndex as number) >= command.changes.length ||
      typeof record.code !== "string" ||
      record.code.trim() === "" ||
      utf8Bytes(record.code) > MAX_WARNING_CODE_BYTES ||
      typeof record.fingerprint !== "string" ||
      !/^[0-9a-f]{64}$/.test(record.fingerprint)
    ) {
      errors.push({
        code: "warning-acknowledgement-invalid",
        anchor: {
          ...(Number.isInteger(changeIndex)
            ? { changeIndex: changeIndex as number }
            : {}),
          field: "warningAcknowledgements",
        },
      });
    }
  }
  return errors;
}

function validateRequiredMetadataText(
  errors: CampusMapPublishValidationIssue[],
  value: unknown,
  maxBytes: number,
  requiredCode: string,
  invalidCode: string,
  tooLongCode: string,
  field: string,
): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({ code: requiredCode, anchor: { field } });
  } else if (containsInvalidPostgresText(value)) {
    errors.push({ code: invalidCode, anchor: { field } });
  } else if (utf8Bytes(value) > maxBytes) {
    errors.push({ code: tooLongCode, anchor: { field } });
  }
}

export function validateChangeIdentities(
  command: CampusMapPublishCommand,
): CampusMapPublishValidationIssue[] {
  const errors: CampusMapPublishValidationIssue[] = [];
  const seenPlaces = new Set<string>();
  for (const [changeIndex, change] of command.changes.entries()) {
    if (
      change.operation !== "create" &&
      change.operation !== "update" &&
      change.operation !== "retire" &&
      change.operation !== "restore"
    ) {
      errors.push({
        code: "invalid-operation",
        anchor: { changeIndex, field: "operation" },
      });
      continue;
    }
    if (change.operation === "create") continue;
    if (
      typeof change.placeId !== "string" ||
      !UUID_PATTERN.test(change.placeId)
    ) {
      errors.push({
        code: "invalid-place-id",
        anchor: { changeIndex, field: "placeId" },
      });
    } else if (seenPlaces.has(change.placeId)) {
      errors.push({
        code: "duplicate-place-change",
        anchor: { changeIndex, placeId: change.placeId, field: "placeId" },
      });
    } else {
      seenPlaces.add(change.placeId);
    }
    if (
      typeof change.baseRevisionId !== "string" ||
      !UUID_PATTERN.test(change.baseRevisionId)
    ) {
      errors.push({
        code: "invalid-base-revision-id",
        anchor: { changeIndex, field: "baseRevisionId" },
      });
    }
  }
  return errors;
}

export function validateFact(
  fact: CampusMapPublishFactInput,
  changeIndex: number,
): CampusMapPublishValidationIssue[] {
  const errors: CampusMapPublishValidationIssue[] = [];
  const anchor = (field: string): CampusMapPublishIssueAnchor => ({
    changeIndex,
    field,
  });
  if (typeof fact.name !== "string" || fact.name.trim() === "") {
    errors.push({ code: "fact-name-required", anchor: anchor("name") });
  } else if (containsInvalidPostgresText(fact.name)) {
    errors.push({ code: "fact-name-invalid", anchor: anchor("name") });
  } else if (utf8Bytes(fact.name) > MAX_FACT_NAME_BYTES) {
    errors.push({ code: "fact-name-too-long", anchor: anchor("name") });
  }
  if (!CAMPUS_MAP_PIN_TYPES.includes(fact.pinType)) {
    errors.push({ code: "invalid-pin-type", anchor: anchor("pinType") });
  }
  if (
    !Array.isArray(fact.capabilities) ||
    fact.capabilities.some(
      (capability) => !CAMPUS_MAP_CAPABILITIES.includes(capability),
    ) ||
    new Set(fact.capabilities).size !== fact.capabilities.length
  ) {
    errors.push({
      code: "invalid-capabilities",
      anchor: anchor("capabilities"),
    });
  }
  if (!CAMPUS_MAP_GENDERS.includes(fact.gender)) {
    errors.push({ code: "invalid-gender", anchor: anchor("gender") });
  }
  if (CAMPUS_MAP_PIN_TYPES.includes(fact.pinType)) {
    const applicableFields = new Set(
      CAMPUS_MAP_FACT_SCHEMA_V1.pinTypes[fact.pinType].applicableFields,
    );
    if (
      Array.isArray(fact.capabilities) &&
      fact.capabilities.length > 0 &&
      !applicableFields.has("capabilities")
    ) {
      errors.push({
        code: "field-not-applicable",
        anchor: anchor("capabilities"),
      });
    }
    if (
      CAMPUS_MAP_GENDERS.includes(fact.gender) &&
      fact.gender !== "unknown" &&
      !applicableFields.has("gender")
    ) {
      errors.push({ code: "field-not-applicable", anchor: anchor("gender") });
    }
  }
  if (!CAMPUS_MAP_WHEELCHAIR_ACCESS.includes(fact.wheelchairAccess)) {
    errors.push({
      code: "invalid-wheelchair-access",
      anchor: anchor("wheelchairAccess"),
    });
  }
  if (!CAMPUS_MAP_AUDIENCES.includes(fact.audience)) {
    errors.push({ code: "invalid-audience", anchor: anchor("audience") });
  }
  if (
    !CAMPUS_MAP_CREDENTIAL_REQUIREMENTS.includes(fact.credentialRequirement)
  ) {
    errors.push({
      code: "invalid-credential-requirement",
      anchor: anchor("credentialRequirement"),
    });
  }
  if (!validAccessSchedule(fact.accessSchedule)) {
    errors.push({
      code: "invalid-access-schedule",
      anchor: anchor("accessSchedule"),
    });
  }
  if (
    fact.reservationRequirement !== "none" &&
    fact.reservationRequirement !== "required" &&
    fact.reservationRequirement !== "unknown"
  ) {
    errors.push({
      code: "invalid-reservation-requirement",
      anchor: anchor("reservationRequirement"),
    });
  }
  if (
    fact.temporaryStatus !== "normal" &&
    fact.temporaryStatus !== "temporarily-closed" &&
    fact.temporaryStatus !== "unknown"
  ) {
    errors.push({
      code: "invalid-temporary-status",
      anchor: anchor("temporaryStatus"),
    });
  }
  if (!validLocation(fact)) {
    errors.push({ code: "invalid-location", anchor: anchor("location") });
  }
  if (
    fact.observedAt !== null &&
    (typeof fact.observedAt !== "string" ||
      !Number.isFinite(Date.parse(fact.observedAt)))
  ) {
    errors.push({ code: "invalid-observed-at", anchor: anchor("observedAt") });
  }
  return errors;
}

function validAccessSchedule(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "unknown" || value.kind === "always") {
    return Object.keys(value).length === 1;
  }
  if (
    value.kind !== "weekly" ||
    value.timezone !== "Asia/Hong_Kong" ||
    !Array.isArray(value.intervals) ||
    value.intervals.length === 0 ||
    !hasOnlyKeys(value, ["kind", "timezone", "intervals"])
  ) {
    return false;
  }
  const weekdays = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return value.intervals.every(
    (interval) =>
      isRecord(interval) &&
      hasOnlyKeys(interval, ["days", "opensAt", "closesAt"]) &&
      Array.isArray(interval.days) &&
      interval.days.length > 0 &&
      interval.days.every(
        (day) => typeof day === "string" && weekdays.has(day),
      ) &&
      typeof interval.opensAt === "string" &&
      typeof interval.closesAt === "string" &&
      timePattern.test(interval.opensAt) &&
      timePattern.test(interval.closesAt) &&
      interval.opensAt !== interval.closesAt,
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

function validLocation(fact: CampusMapPublishFactInput): boolean {
  const location = fact.location;
  if (!isRecord(location)) return false;
  if (location.kind === "building") {
    return (
      typeof fact.buildingId === "string" &&
      UUID_PATTERN.test(fact.buildingId) &&
      fact.floorId === null
    );
  }
  if (location.kind === "floor") {
    return (
      typeof fact.buildingId === "string" &&
      UUID_PATTERN.test(fact.buildingId) &&
      typeof fact.floorId === "string" &&
      UUID_PATTERN.test(fact.floorId)
    );
  }
  return (
    location.kind === "outdoor-point" &&
    fact.buildingId === null &&
    fact.floorId === null &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    location.crs === "wgs84" &&
    (location.precision === "approximate" || location.precision === "precise")
  );
}

export function validateSource(
  source: CampusMapPublishSourceInput,
  changeIndex: number,
  sourceIndex: number,
): CampusMapPublishValidationIssue[] {
  const errors: CampusMapPublishValidationIssue[] = [];
  const anchor = (field: string): CampusMapPublishIssueAnchor => ({
    changeIndex,
    field: `sources.${sourceIndex}.${field}`,
  });
  if (typeof source.ref !== "string" || source.ref.trim() === "") {
    errors.push({ code: "source-ref-required", anchor: anchor("ref") });
  } else if (containsInvalidPostgresText(source.ref)) {
    errors.push({ code: "source-ref-invalid", anchor: anchor("ref") });
  } else if (utf8Bytes(source.ref) > MAX_SOURCE_REF_BYTES) {
    errors.push({ code: "source-ref-too-long", anchor: anchor("ref") });
  }
  if (
    source.kind !== "official" &&
    source.kind !== "field-observation" &&
    source.kind !== "open-data" &&
    source.kind !== "provider-candidate" &&
    source.kind !== "other"
  ) {
    errors.push({ code: "invalid-source-kind", anchor: anchor("kind") });
  }
  validateOptionalSourceText(
    errors,
    source.url,
    MAX_SOURCE_URL_BYTES,
    "source-url-too-long",
    anchor("url"),
  );
  validateOptionalSourceText(
    errors,
    source.owner,
    MAX_SOURCE_OWNER_BYTES,
    "source-owner-too-long",
    anchor("owner"),
  );
  validateOptionalSourceText(
    errors,
    source.version,
    MAX_SOURCE_VERSION_BYTES,
    "source-version-too-long",
    anchor("version"),
  );
  validateOptionalSourceText(
    errors,
    source.snapshotHash,
    MAX_SOURCE_HASH_BYTES,
    "source-hash-too-long",
    anchor("snapshotHash"),
  );
  validateOptionalSourceText(
    errors,
    source.limitations,
    MAX_SOURCE_TEXT_BYTES,
    "source-limitations-too-long",
    anchor("limitations"),
  );
  validateOptionalSourceText(
    errors,
    source.note,
    MAX_SOURCE_TEXT_BYTES,
    "source-note-too-long",
    anchor("note"),
  );
  if (!validDateOnly(source.accessedOn)) {
    errors.push({
      code: "invalid-source-accessed-on",
      anchor: anchor("accessedOn"),
    });
  }
  if (
    source.observedAt !== null &&
    (typeof source.observedAt !== "string" ||
      !Number.isFinite(Date.parse(source.observedAt)))
  ) {
    errors.push({
      code: "invalid-source-observed-at",
      anchor: anchor("observedAt"),
    });
  }
  if (
    source.rightsStatus !== "public-domain" &&
    source.rightsStatus !== "permission-granted" &&
    source.rightsStatus !== "original-observation" &&
    source.rightsStatus !== "restricted" &&
    source.rightsStatus !== "unknown"
  ) {
    errors.push({
      code: "invalid-source-rights",
      anchor: anchor("rightsStatus"),
    });
  }
  if (!validSourceCoordinate(source.sourceCoordinate)) {
    errors.push({
      code: "invalid-source-coordinate-lineage",
      anchor: anchor("sourceCoordinate"),
    });
  }
  return errors;
}

function validateOptionalSourceText(
  errors: CampusMapPublishValidationIssue[],
  value: unknown,
  maxBytes: number,
  code: string,
  anchor: CampusMapPublishIssueAnchor,
): void {
  if (
    value !== null &&
    (typeof value !== "string" || containsInvalidPostgresText(value))
  ) {
    errors.push({ code: "source-text-invalid", anchor });
  } else if (typeof value === "string" && utf8Bytes(value) > maxBytes) {
    errors.push({ code, anchor });
  }
}

export type IndexedPublishSource = {
  source: CampusMapPublishSourceInput;
  changeIndex: number;
  sourceIndex: number;
};

export function analyzeSourceIdentities(command: CampusMapPublishCommand): {
  errors: CampusMapPublishValidationIssue[];
  sources: IndexedPublishSource[];
} {
  const byIdentity = new Map<string, IndexedPublishSource[]>();
  const duplicateErrors: CampusMapPublishValidationIssue[] = [];
  for (const [changeIndex, change] of command.changes.entries()) {
    const identitiesInChange = new Set<string>();
    for (const [sourceIndex, source] of change.sources.entries()) {
      const identity = sourceIdentity(source);
      const indexed = { source, changeIndex, sourceIndex };
      if (identitiesInChange.has(identity)) {
        duplicateErrors.push({
          code: "duplicate-source-reference",
          anchor: { changeIndex, field: `sources.${sourceIndex}.ref` },
        });
      } else {
        identitiesInChange.add(identity);
      }
      byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), indexed]);
    }
  }
  const uniqueSources = [...byIdentity.values()].map((sources) => sources[0]);
  if (duplicateErrors.length > 0) {
    return { errors: duplicateErrors, sources: uniqueSources };
  }
  const inputMismatches = [...byIdentity.values()].flatMap((sources) => {
    const expected = normalizedSourceMetadata(sources[0].source);
    return sources
      .slice(1)
      .flatMap((candidate) =>
        sameSourceMetadata(expected, normalizedSourceMetadata(candidate.source))
          ? []
          : [sourceRefMismatch(candidate)],
      );
  });
  return { errors: inputMismatches, sources: uniqueSources };
}

export function sourceIdentity(source: {
  kind: CampusMapProvenanceKind;
  ref: string;
}): string {
  return `${source.kind}\u0000${source.ref}`;
}

export function sourceRefMismatch(
  source: IndexedPublishSource,
): CampusMapPublishValidationIssue {
  return {
    code: "source-ref-mismatch",
    anchor: {
      changeIndex: source.changeIndex,
      field: `sources.${source.sourceIndex}.ref`,
    },
  };
}

type NormalizedSourceMetadata = ReturnType<typeof normalizedSourceMetadata>;

function normalizedSourceMetadata(source: CampusMapPublishSourceInput) {
  return {
    url: source.url,
    owner: source.owner,
    version: source.version,
    snapshotHash: source.snapshotHash,
    accessedOn: source.accessedOn,
    observedAt:
      source.observedAt === null
        ? null
        : new Date(source.observedAt).toISOString(),
    rightsStatus: source.rightsStatus,
    limitations: source.limitations,
    note: source.note,
    sourceCoordinateX: source.sourceCoordinate?.x ?? null,
    sourceCoordinateY: source.sourceCoordinate?.y ?? null,
    sourceCoordinateCrs: source.sourceCoordinate?.crs ?? null,
    conversionMethod: source.sourceCoordinate?.conversion?.method ?? null,
    conversionVersion: source.sourceCoordinate?.conversion?.version ?? null,
  };
}

function sameSourceMetadata(
  left: NormalizedSourceMetadata,
  right: NormalizedSourceMetadata,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function toAppendProvenanceSource(
  source: CampusMapPublishSourceInput,
): CampusMapAppendProvenanceSource {
  return {
    kind: source.kind,
    ref: source.ref,
    url: source.url,
    owner: source.owner,
    version: source.version,
    snapshotHash: source.snapshotHash,
    accessedOn: source.accessedOn,
    observedAt: source.observedAt === null ? null : new Date(source.observedAt),
    rightsStatus: source.rightsStatus,
    limitations: source.limitations,
    note: source.note,
    sourceCoordinateX: source.sourceCoordinate?.x ?? null,
    sourceCoordinateY: source.sourceCoordinate?.y ?? null,
    sourceCoordinateCrs: source.sourceCoordinate?.crs ?? null,
    conversionMethod: source.sourceCoordinate?.conversion?.method ?? null,
    conversionVersion: source.sourceCoordinate?.conversion?.version ?? null,
  };
}

export function toAppendFact(
  input: CampusMapPublishFactInput,
): CampusMapAppendFact {
  return {
    name: input.name.trim(),
    buildingId: input.buildingId,
    floorId: input.floorId,
    pinType: input.pinType,
    capabilities: [...input.capabilities],
    gender: input.gender,
    wheelchairAccess: input.wheelchairAccess,
    audience: input.audience,
    credentialRequirement: input.credentialRequirement,
    accessSchedule: input.accessSchedule,
    reservationRequirement: input.reservationRequirement,
    temporaryStatus: input.temporaryStatus,
    locationKind: input.location.kind,
    pointPrecision:
      input.location.kind === "outdoor-point" ? input.location.precision : null,
    longitude:
      input.location.kind === "outdoor-point" ? input.location.longitude : null,
    latitude:
      input.location.kind === "outdoor-point" ? input.location.latitude : null,
    coordinateCrs:
      input.location.kind === "outdoor-point" ? input.location.crs : null,
    observedAt: input.observedAt === null ? null : new Date(input.observedAt),
    verifiedAt: null,
    verifiedByActorIdSnapshot: null,
  };
}

function validDateOnly(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function validSourceCoordinate(coordinate: unknown): boolean {
  if (coordinate === null) return true;
  if (!isRecord(coordinate)) return false;
  if (
    typeof coordinate.x !== "number" ||
    typeof coordinate.y !== "number" ||
    !Number.isFinite(coordinate.x) ||
    !Number.isFinite(coordinate.y) ||
    !CAMPUS_MAP_SOURCE_COORDINATE_CRS.some((crs) => crs === coordinate.crs)
  ) {
    return false;
  }
  if (
    (coordinate.crs === "wgs84" || coordinate.crs === "gcj02") &&
    (coordinate.x < -180 ||
      coordinate.x > 180 ||
      coordinate.y < -90 ||
      coordinate.y > 90)
  ) {
    return false;
  }
  const conversion = coordinate.conversion;
  if (coordinate.crs !== "wgs84" && conversion === null) return false;
  if (conversion === null) return true;
  return (
    isRecord(conversion) &&
    CAMPUS_MAP_COORDINATE_CONVERSION_METHODS.some(
      (method) => method === conversion.method,
    ) &&
    typeof conversion.version === "string" &&
    conversion.version.trim() !== "" &&
    !containsInvalidPostgresText(conversion.version) &&
    utf8Bytes(conversion.version) <= MAX_SOURCE_VERSION_BYTES
  );
}
