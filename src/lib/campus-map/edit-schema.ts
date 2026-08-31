import type { CampusMapFactFieldKey } from "@/db/schema";

import type {
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";

export type CampusMapEditFieldKey = CampusMapFactFieldKey | "sources";

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
  pinType: CampusMapPublishFactInput["pinType"];
  defaultName: string;
  fields: CampusMapEditFieldKey[];
  requiredFields: CampusMapEditFieldKey[];
}

export type CampusMapFactNameErrorCode =
  | "fact-name-required"
  | "fact-name-invalid"
  | "fact-name-too-long";

export const CAMPUS_MAP_FACT_NAME_MAX_BYTES = 240;

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

const REQUIRED_EDIT_FIELDS = [
  "name",
  "pinType",
  "location",
  "sources",
] as const satisfies readonly CampusMapEditFieldKey[];

/** The canonical access facts exposed together by the focused Place editor. */
export const CAMPUS_MAP_EDIT_ACCESS_FIELDS = [
  "audience",
  "credentialRequirement",
  "accessSchedule",
  "reservationRequirement",
  "temporaryStatus",
] as const satisfies readonly CampusMapEditFieldKey[];

function validWeeklySchedule(draft: CampusMapEditValidationDraft) {
  const schedule = draft.fact.accessSchedule;
  return (
    schedule.kind !== "weekly" ||
    schedule.intervals.every(
      (interval) =>
        interval.days.length > 0 &&
        Boolean(interval.opensAt) &&
        Boolean(interval.closesAt) &&
        interval.opensAt !== interval.closesAt,
    )
  );
}

export const CAMPUS_MAP_EDIT_SCHEMA = {
  version: 1,
  fieldDefinitions: {
    name: {
      isValid: (draft, required) =>
        !required || campusMapFactNameError(draft.fact.name) === null,
    },
    pinType: {
      isValid: (draft, required) => !required || Boolean(draft.fact.pinType),
    },
    capabilities: {
      isValid: (draft, required) =>
        !required || draft.fact.capabilities.length > 0,
    },
    gender: { isValid: () => true },
    wheelchairAccess: { isValid: () => true },
    audience: { isValid: () => true },
    credentialRequirement: { isValid: () => true },
    accessSchedule: {
      isValid: (draft) => validWeeklySchedule(draft),
    },
    reservationRequirement: { isValid: () => true },
    temporaryStatus: { isValid: () => true },
    location: {
      isValid: (draft, required) => !required || draft.fact.location !== null,
    },
    sources: {
      isValid: (draft, required) => !required || draft.sources.length > 0,
    },
  } satisfies Record<CampusMapEditFieldKey, CampusMapEditFieldDefinition>,
  presets: [
    {
      pinType: "water",
      defaultName: "饮水机",
      fields: [
        "name",
        "pinType",
        "wheelchairAccess",
        ...CAMPUS_MAP_EDIT_ACCESS_FIELDS,
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
    {
      pinType: "toilet",
      defaultName: "洗手间",
      fields: [
        "name",
        "pinType",
        "gender",
        "wheelchairAccess",
        ...CAMPUS_MAP_EDIT_ACCESS_FIELDS,
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
    {
      pinType: "printer",
      defaultName: "打印站",
      fields: [
        "name",
        "pinType",
        "capabilities",
        "wheelchairAccess",
        ...CAMPUS_MAP_EDIT_ACCESS_FIELDS,
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
    {
      pinType: "common-space",
      defaultName: "公共空间",
      fields: [
        "name",
        "pinType",
        "wheelchairAccess",
        ...CAMPUS_MAP_EDIT_ACCESS_FIELDS,
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
    {
      pinType: "classroom",
      defaultName: "课室",
      fields: [
        "name",
        "pinType",
        "wheelchairAccess",
        ...CAMPUS_MAP_EDIT_ACCESS_FIELDS,
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
  ] satisfies CampusMapEditPreset[],
} as const;

export function firstInvalidCampusMapEditField(
  draft: CampusMapEditValidationDraft,
  schemaRequiredFields: readonly CampusMapEditFieldKey[] = [],
): CampusMapEditFieldKey | null {
  const preset =
    CAMPUS_MAP_EDIT_SCHEMA.presets.find(
      (item) => item.pinType === draft.fact.pinType,
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
