import type { CampusMapPublishSourceInput } from "@/lib/campus-map/publish-contract";
import {
  campusMapUtf8ByteLength,
  containsInvalidCampusMapPostgresText,
} from "@/lib/campus-map/text-validation";

export const CAMPUS_MAP_FLOOR_LABEL_MAX_BYTES = 64;

/**
 * ECMAScript WhiteSpace + LineTerminator characters accepted at label
 * boundaries. The database schema builds its btrim character set from this
 * value so browser and PostgreSQL identity rules cannot drift independently.
 */
export const CAMPUS_MAP_FLOOR_LABEL_TRIM_CHARACTERS =
  "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

const campusMapFloorLabelTrimCharacters = new Set(
  CAMPUS_MAP_FLOOR_LABEL_TRIM_CHARACTERS,
);

export type CampusMapFloorLabelErrorCode =
  | "floor-label-required"
  | "floor-label-invalid"
  | "floor-label-too-long";

export function campusMapFloorLabelError(
  value: unknown,
): CampusMapFloorLabelErrorCode | null {
  if (typeof value !== "string") {
    return "floor-label-required";
  }
  const normalized = normalizeCampusMapFloorLabel(value);
  if (normalized === "") {
    return "floor-label-required";
  }
  if (containsInvalidCampusMapPostgresText(value)) {
    return "floor-label-invalid";
  }
  if (campusMapUtf8ByteLength(normalized) > CAMPUS_MAP_FLOOR_LABEL_MAX_BYTES) {
    return "floor-label-too-long";
  }
  return null;
}

/**
 * Keeps normalization deliberately conservative: case and surrounding spaces
 * do not create another Floor, while labels such as `G` and `G/F` stay distinct.
 */
export function normalizeCampusMapFloorLabel(value: string): string {
  let start = 0;
  let end = value.length;
  while (
    start < end &&
    campusMapFloorLabelTrimCharacters.has(value.charAt(start))
  ) {
    start += 1;
  }
  while (
    end > start &&
    campusMapFloorLabelTrimCharacters.has(value.charAt(end - 1))
  ) {
    end -= 1;
  }
  return value.slice(start, end);
}

export function isCampusMapFloorEvidenceSource(
  source: Pick<CampusMapPublishSourceInput, "kind">,
): boolean {
  return source.kind !== "provider-candidate";
}

export function campusMapFloorDisplayLabel(label: string): string {
  if (/^\d+$/.test(label)) return `${label} 楼`;
  if (/^g$/i.test(label)) return `地下（${label}）`;
  if (/^lg$/i.test(label)) return `低层地下（${label}）`;
  return label;
}
