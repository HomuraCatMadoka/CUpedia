import {
  CAMPUS_MAP_PLACE_TYPES,
  CAMPUS_MAP_PUBLIC_PLACE_TYPES,
} from "@/lib/campus-map/controlled-values";

export const CAMPUS_MAP_FACT_FIELD_KEYS_V2 = [
  "name",
  "placeType",
  "regularHours",
  "officialActions",
  "visitNote",
  "capabilities",
  "gender",
  "wheelchairAccess",
  "location",
] as const;

export type CampusMapFactFieldKeyV2 =
  (typeof CAMPUS_MAP_FACT_FIELD_KEYS_V2)[number];
export type CampusMapPlaceType = (typeof CAMPUS_MAP_PLACE_TYPES)[number];
export type CampusMapPublicPlaceType =
  (typeof CAMPUS_MAP_PUBLIC_PLACE_TYPES)[number];

export const CAMPUS_MAP_REQUIRED_FACT_FIELDS_V2 = [
  "name",
  "placeType",
  "location",
] as const satisfies readonly CampusMapFactFieldKeyV2[];

const COMMON_FACT_FIELDS = [
  "name",
  "placeType",
  "regularHours",
  "officialActions",
  "visitNote",
  "location",
] as const satisfies readonly CampusMapFactFieldKeyV2[];

const applicableFields = (
  extraFields: readonly CampusMapFactFieldKeyV2[] = [],
) => [...COMMON_FACT_FIELDS, ...extraFields] as const;

/**
 * One client-safe source for V2 field applicability. The database schema and
 * editor may choose different display orders, but neither may redefine which
 * facts belong to a Place type.
 */
export const CAMPUS_MAP_APPLICABLE_FACT_FIELDS_V2 = {
  toilet: applicableFields(["gender", "wheelchairAccess"]),
  water: applicableFields(["wheelchairAccess"]),
  printer: applicableFields(["capabilities", "wheelchairAccess"]),
  "common-space": applicableFields(["wheelchairAccess"]),
  classroom: applicableFields(["wheelchairAccess"]),
  "sports-facility": applicableFields(["wheelchairAccess"]),
  "health-service": applicableFields(["wheelchairAccess"]),
  "vending-machine": applicableFields(["wheelchairAccess"]),
} as const satisfies Record<
  CampusMapPlaceType,
  readonly CampusMapFactFieldKeyV2[]
>;

export function campusMapFactFieldAppliesV2(
  placeType: CampusMapPlaceType,
  field: CampusMapFactFieldKeyV2,
) {
  const fields: readonly CampusMapFactFieldKeyV2[] =
    CAMPUS_MAP_APPLICABLE_FACT_FIELDS_V2[placeType];
  return fields.includes(field);
}

export function campusMapPlaceTypesForFactFieldV2(
  field: CampusMapFactFieldKeyV2,
): CampusMapPlaceType[] {
  return CAMPUS_MAP_PLACE_TYPES.filter((placeType) =>
    campusMapFactFieldAppliesV2(placeType, field),
  );
}
