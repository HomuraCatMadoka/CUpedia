/**
 * Client-safe runtime values shared by the Drizzle schema, publish contract,
 * and versioned draft decoder. Keep these arrays as the single runtime source
 * so adding a controlled value cannot leave restored drafts behind.
 */
/** Historical V1 values. Keep immutable so old revisions remain decodable. */
export const CAMPUS_MAP_PIN_TYPES_V1 = [
  "toilet",
  "water",
  "printer",
  "common-space",
  "classroom",
] as const;

/** Place types with a separately accepted public map/card presentation. */
export const CAMPUS_MAP_PUBLIC_PLACE_TYPES = [
  ...CAMPUS_MAP_PIN_TYPES_V1,
  "sports-facility",
  "health-service",
] as const;

/** Broad, reusable Place search categories used by the active V2 contract. */
export const CAMPUS_MAP_PLACE_TYPES = [
  ...CAMPUS_MAP_PUBLIC_PLACE_TYPES,
  "vending-machine",
] as const;

export function isCampusMapPinTypeV1(
  value: string,
): value is (typeof CAMPUS_MAP_PIN_TYPES_V1)[number] {
  return CAMPUS_MAP_PIN_TYPES_V1.some((candidate) => candidate === value);
}

export function isCampusMapPlaceType(
  value: string,
): value is (typeof CAMPUS_MAP_PLACE_TYPES)[number] {
  return CAMPUS_MAP_PLACE_TYPES.some((candidate) => candidate === value);
}

export function isCampusMapPublicPlaceType(
  value: string,
): value is (typeof CAMPUS_MAP_PUBLIC_PLACE_TYPES)[number] {
  return CAMPUS_MAP_PUBLIC_PLACE_TYPES.some((candidate) => candidate === value);
}

/** @deprecated V1-only name retained for historical codecs. */
export const CAMPUS_MAP_PIN_TYPES = CAMPUS_MAP_PIN_TYPES_V1;

export const CAMPUS_MAP_CAPABILITIES = ["print", "scan", "copy"] as const;

export const CAMPUS_MAP_GENDERS = [
  "male",
  "female",
  "all-gender",
  "unknown",
] as const;

export const CAMPUS_MAP_V2_GENDERS = ["male", "female", "all-gender"] as const;

export const CAMPUS_MAP_WHEELCHAIR_ACCESS = [
  "yes",
  "limited",
  "no",
  "unknown",
] as const;

export const CAMPUS_MAP_V2_WHEELCHAIR_ACCESS = [
  "yes",
  "limited",
  "no",
] as const;

export const CAMPUS_MAP_AUDIENCES = [
  "public",
  "cuhk-member",
  "library-member",
  "unknown",
] as const;

export const CAMPUS_MAP_CREDENTIAL_REQUIREMENTS = [
  "none",
  "campus-card",
  "library-card",
  "other",
  "unknown",
] as const;

export const CAMPUS_MAP_RESERVATION_REQUIREMENTS = [
  "none",
  "required",
  "unknown",
] as const;

export const CAMPUS_MAP_TEMPORARY_STATUSES = [
  "normal",
  "temporarily-closed",
  "unknown",
] as const;

export const CAMPUS_MAP_PROVENANCE_KINDS = [
  "official",
  "field-observation",
  "open-data",
  "provider-candidate",
  "other",
] as const;

export const CAMPUS_MAP_RIGHTS_STATUSES = [
  "public-domain",
  "permission-granted",
  "original-observation",
  "restricted",
  "unknown",
] as const;

export const CAMPUS_MAP_SOURCE_COORDINATE_CRS = [
  "wgs84",
  "gcj02",
  "hk80",
  "hkpd",
  "other",
] as const;

export const CAMPUS_MAP_COORDINATE_CONVERSION_METHODS = [
  "proj",
  "manual",
  "provider-adapter",
  "other",
] as const;

export const CAMPUS_MAP_PLACE_PHOTO_ROLES = [
  "entrance",
  "overview",
  "interior",
  "equipment",
  "accessibility",
] as const;
