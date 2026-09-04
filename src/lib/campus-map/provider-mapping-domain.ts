import { canonicalizeCampusMapUuid } from "@/lib/campus-map/canonical-uuid";

export interface CampusMapProviderIdentity {
  provider: string;
  providerObjectId: string;
}

export type CampusMapProviderMappingTarget =
  | { kind: "building"; buildingId: string }
  | { kind: "place"; placeId: string };

export interface CampusMapProviderMappingProjection {
  providerObjectId: string;
  target: CampusMapProviderMappingTarget;
}

export interface CampusMapProviderMappingValidationError {
  code: string;
  field: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => expectedKeys.includes(key))
  );
}

export function normalizeCampusMapProviderIdentity(
  value: unknown,
): CampusMapProviderIdentity | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["provider", "providerObjectId"]) ||
    typeof value.provider !== "string" ||
    typeof value.providerObjectId !== "string"
  ) {
    return null;
  }
  return {
    provider: value.provider,
    providerObjectId: value.providerObjectId,
  };
}

export function normalizeCampusMapProviderMappingTarget(
  value: unknown,
): CampusMapProviderMappingTarget | null {
  if (!isRecord(value)) return null;
  if (
    value.kind === "building" &&
    typeof value.buildingId === "string" &&
    hasExactKeys(value, ["kind", "buildingId"])
  ) {
    return {
      kind: "building",
      buildingId: canonicalizeCampusMapUuid(value.buildingId),
    };
  }
  if (
    value.kind === "place" &&
    typeof value.placeId === "string" &&
    hasExactKeys(value, ["kind", "placeId"])
  ) {
    return {
      kind: "place",
      placeId: canonicalizeCampusMapUuid(value.placeId),
    };
  }
  return null;
}

export function validateCampusMapProviderIdentity(
  identity: CampusMapProviderIdentity,
): CampusMapProviderMappingValidationError[] {
  const errors: CampusMapProviderMappingValidationError[] = [];
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(identity.provider)) {
    errors.push({ code: "invalid-provider", field: "identity.provider" });
  }
  if (
    identity.providerObjectId.trim() === "" ||
    identity.providerObjectId !== identity.providerObjectId.trim() ||
    Buffer.byteLength(identity.providerObjectId, "utf8") > 512 ||
    /[\u0000-\u001f\u007f]/.test(identity.providerObjectId)
  ) {
    errors.push({
      code: "invalid-provider-object-id",
      field: "identity.providerObjectId",
    });
  }
  return errors;
}

export function campusMapProviderIdentityKey(
  identity: CampusMapProviderIdentity,
) {
  return `${identity.provider}\u0000${identity.providerObjectId}`;
}

export function sameCampusMapProviderMappingTarget(
  left: CampusMapProviderMappingTarget | null,
  right: CampusMapProviderMappingTarget | null,
) {
  if (left === null || right === null) return left === right;
  return left.kind === "building"
    ? right.kind === "building" && left.buildingId === right.buildingId
    : right.kind === "place" && left.placeId === right.placeId;
}
