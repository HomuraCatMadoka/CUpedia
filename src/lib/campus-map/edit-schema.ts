import {
  campusMapOfficialActionError,
  CAMPUS_MAP_OFFICIAL_ACTION_MAX_COUNT,
} from "@/lib/campus-map/official-action";
import {
  CAMPUS_MAP_APPLICABLE_FACT_FIELDS_V2,
  CAMPUS_MAP_REQUIRED_FACT_FIELDS_V2,
  type CampusMapFactFieldKeyV2,
} from "@/lib/campus-map/place-type-contract";
import { isCampusMapRegularHours } from "@/lib/campus-map/regular-hours";
import type {
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";

export type CampusMapEditFieldKey = CampusMapFactFieldKeyV2 | "sources";

export interface CampusMapEditValidationDraft {
  fact: Omit<CampusMapPublishFactInput, "location"> & {
    location: CampusMapPublishFactInput["location"] | null;
  };
  sources: CampusMapPublishSourceInput[];
}

export interface CampusMapEditFieldDefinition {
  isValid(draft: CampusMapEditValidationDraft, required: boolean): boolean;
}

export interface CampusMapEditPreset {
  placeType: CampusMapPublishFactInput["placeType"];
  defaultName: string;
  fields: CampusMapEditFieldKey[];
  requiredFields: CampusMapEditFieldKey[];
}

export type CampusMapFactNameErrorCode =
  | "fact-name-required"
  | "fact-name-invalid"
  | "fact-name-too-long";

export const CAMPUS_MAP_FACT_NAME_MAX_BYTES = 240;
export const CAMPUS_MAP_VISIT_NOTE_MAX_BYTES = 500;

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

export function campusMapFactNameError(
  value: unknown,
): CampusMapFactNameErrorCode | null {
  if (typeof value !== "string" || value.trim() === "") {
    return "fact-name-required";
  }
  if (value.includes("\u0000") || containsUnpairedSurrogate(value)) {
    return "fact-name-invalid";
  }
  if (
    new TextEncoder().encode(value).byteLength > CAMPUS_MAP_FACT_NAME_MAX_BYTES
  ) {
    return "fact-name-too-long";
  }
  return null;
}

export function campusMapOptionalShortTextIsValid(
  value: unknown,
  maxBytes: number,
): boolean {
  return (
    value === null ||
    (typeof value === "string" &&
      value.trim() !== "" &&
      !value.includes("\u0000") &&
      !containsUnpairedSurrogate(value) &&
      new TextEncoder().encode(value).byteLength <= maxBytes)
  );
}

const REQUIRED_EDIT_FIELDS = [
  ...CAMPUS_MAP_REQUIRED_FACT_FIELDS_V2,
  "sources",
] as const satisfies readonly CampusMapEditFieldKey[];

/** Optional operating facts kept behind the detail disclosure, never in Add. */
export const CAMPUS_MAP_EDIT_OPERATING_FIELDS = [
  "regularHours",
  "officialActions",
  "visitNote",
] as const satisfies readonly CampusMapEditFieldKey[];

const EDIT_FIELD_ORDER = [
  "name",
  "placeType",
  "capabilities",
  "gender",
  "wheelchairAccess",
  ...CAMPUS_MAP_EDIT_OPERATING_FIELDS,
  "location",
] as const satisfies readonly CampusMapFactFieldKeyV2[];

function editFieldsFor(
  placeType: CampusMapPublishFactInput["placeType"],
): CampusMapEditFieldKey[] {
  const applicableFields: readonly CampusMapFactFieldKeyV2[] =
    CAMPUS_MAP_APPLICABLE_FACT_FIELDS_V2[placeType];
  return [
    ...EDIT_FIELD_ORDER.filter((field) => applicableFields.includes(field)),
    "sources",
  ];
}

const EDIT_PRESET_NAMES = [
  { placeType: "water", defaultName: "饮水机" },
  { placeType: "toilet", defaultName: "洗手间" },
  { placeType: "printer", defaultName: "打印站" },
  { placeType: "common-space", defaultName: "公共空间" },
  { placeType: "classroom", defaultName: "课室" },
  { placeType: "sports-facility", defaultName: "体育设施" },
  { placeType: "health-service", defaultName: "医疗服务" },
  { placeType: "vending-machine", defaultName: "自动售卖机" },
] as const satisfies ReadonlyArray<
  Pick<CampusMapEditPreset, "placeType" | "defaultName">
>;

const EDIT_PRESETS = EDIT_PRESET_NAMES.map((preset) => ({
  ...preset,
  fields: editFieldsFor(preset.placeType),
}));

export const CAMPUS_MAP_EDIT_SCHEMA = {
  version: 2,
  fieldDefinitions: {
    name: {
      isValid: (draft, required) =>
        !required || campusMapFactNameError(draft.fact.name) === null,
    },
    placeType: {
      isValid: (draft, required) => !required || Boolean(draft.fact.placeType),
    },
    regularHours: {
      isValid: (draft) =>
        draft.fact.regularHours === null ||
        isCampusMapRegularHours(draft.fact.regularHours),
    },
    officialActions: {
      isValid: (draft) =>
        draft.fact.officialActions.length <=
          CAMPUS_MAP_OFFICIAL_ACTION_MAX_COUNT &&
        draft.fact.officialActions.every(
          (action) => campusMapOfficialActionError(action) === null,
        ),
    },
    visitNote: {
      isValid: (draft) =>
        campusMapOptionalShortTextIsValid(
          draft.fact.visitNote,
          CAMPUS_MAP_VISIT_NOTE_MAX_BYTES,
        ),
    },
    capabilities: {
      isValid: (draft, required) =>
        !required || draft.fact.capabilities.length > 0,
    },
    gender: { isValid: () => true },
    wheelchairAccess: { isValid: () => true },
    location: {
      isValid: (draft, required) => !required || draft.fact.location !== null,
    },
    sources: {
      isValid: (draft, required) => !required || draft.sources.length > 0,
    },
  } satisfies Record<CampusMapEditFieldKey, CampusMapEditFieldDefinition>,
  presets: EDIT_PRESETS.map(
    (preset): CampusMapEditPreset => ({
      ...preset,
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    }),
  ),
} as const;

export function firstInvalidCampusMapEditField(
  draft: CampusMapEditValidationDraft,
  schemaRequiredFields: readonly CampusMapEditFieldKey[] = [],
): CampusMapEditFieldKey | null {
  const preset =
    CAMPUS_MAP_EDIT_SCHEMA.presets.find(
      (item) => item.placeType === draft.fact.placeType,
    ) ?? CAMPUS_MAP_EDIT_SCHEMA.presets[0];
  const requiredFields = new Set<CampusMapEditFieldKey>([
    ...preset.requiredFields,
    ...schemaRequiredFields,
  ]);
  const presetFields: readonly CampusMapEditFieldKey[] = preset.fields;
  const validationOrder = [
    ...presetFields,
    ...schemaRequiredFields.filter((field) => !presetFields.includes(field)),
  ];

  for (const field of validationOrder) {
    if (
      !CAMPUS_MAP_EDIT_SCHEMA.fieldDefinitions[field].isValid(
        draft,
        requiredFields.has(field),
      )
    ) {
      return field;
    }
  }
  return null;
}
