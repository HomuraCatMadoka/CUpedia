/**
 * Client-safe runtime values shared by the Drizzle schema, publish contract,
 * and versioned draft decoder. Keep these arrays as the single runtime source
 * so adding a controlled value cannot leave restored drafts behind.
 */
export const CAMPUS_MAP_PIN_TYPES = [
  "toilet",
  "water",
  "printer",
  "common-space",
  "classroom",
] as const;

export const CAMPUS_MAP_CAPABILITIES = ["print", "scan", "copy"] as const;

export const CAMPUS_MAP_GENDERS = [
  "male",
  "female",
  "all-gender",
  "unknown",
] as const;

export const CAMPUS_MAP_WHEELCHAIR_ACCESS = [
  "yes",
  "limited",
  "no",
  "unknown",
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
