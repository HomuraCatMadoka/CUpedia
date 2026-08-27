const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCampusMapUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isCanonicalCampusMapUuid(value: unknown): value is string {
  return isCampusMapUuid(value) && value === value.toLowerCase();
}

export function canonicalizeCampusMapUuid<T>(value: T): T {
  return isCampusMapUuid(value) ? (value.toLowerCase() as T) : value;
}
