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
  label: string;
  isValid(draft: CampusMapEditValidationDraft, required: boolean): boolean;
}

export interface CampusMapEditOption<T extends string = string> {
  value: T;
  label: string;
}

export interface CampusMapEditPreset {
  pinType: CampusMapPublishFactInput["pinType"];
  label: string;
  defaultName: string;
  fields: CampusMapEditFieldKey[];
  requiredFields: CampusMapEditFieldKey[];
}

const REQUIRED_EDIT_FIELDS = [
  "name",
  "pinType",
  "location",
  "sources",
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
      label: "设施名称或编号",
      isValid: (draft, required) =>
        !required || Boolean(draft.fact.name.trim()),
    },
    pinType: {
      label: "设施类型",
      isValid: (draft, required) => !required || Boolean(draft.fact.pinType),
    },
    capabilities: {
      label: "服务能力",
      isValid: (draft, required) =>
        !required || draft.fact.capabilities.length > 0,
    },
    gender: { label: "性别属性", isValid: () => true },
    wheelchairAccess: { label: "无障碍通行", isValid: () => true },
    audience: { label: "开放对象", isValid: () => true },
    credentialRequirement: { label: "凭证要求", isValid: () => true },
    accessSchedule: {
      label: "开放时间",
      isValid: (draft) => validWeeklySchedule(draft),
    },
    reservationRequirement: { label: "预约要求", isValid: () => true },
    temporaryStatus: { label: "临时状态", isValid: () => true },
    location: {
      label: "位置",
      isValid: (draft, required) => !required || draft.fact.location !== null,
    },
    sources: {
      label: "资料依据",
      isValid: (draft, required) => !required || draft.sources.length > 0,
    },
  } satisfies Record<CampusMapEditFieldKey, CampusMapEditFieldDefinition>,
  presets: [
    {
      pinType: "water",
      label: "饮水点",
      defaultName: "饮水机",
      fields: [
        "name",
        "pinType",
        "wheelchairAccess",
        "audience",
        "credentialRequirement",
        "accessSchedule",
        "reservationRequirement",
        "temporaryStatus",
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
    {
      pinType: "toilet",
      label: "洗手间",
      defaultName: "洗手间",
      fields: [
        "name",
        "pinType",
        "gender",
        "wheelchairAccess",
        "audience",
        "credentialRequirement",
        "accessSchedule",
        "reservationRequirement",
        "temporaryStatus",
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
    {
      pinType: "printer",
      label: "打印服务",
      defaultName: "打印站",
      fields: [
        "name",
        "pinType",
        "capabilities",
        "wheelchairAccess",
        "audience",
        "credentialRequirement",
        "accessSchedule",
        "reservationRequirement",
        "temporaryStatus",
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
    {
      pinType: "common-space",
      label: "公共空间",
      defaultName: "公共空间",
      fields: [
        "name",
        "pinType",
        "wheelchairAccess",
        "audience",
        "credentialRequirement",
        "accessSchedule",
        "reservationRequirement",
        "temporaryStatus",
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
    {
      pinType: "classroom",
      label: "课室",
      defaultName: "课室",
      fields: [
        "name",
        "pinType",
        "wheelchairAccess",
        "audience",
        "credentialRequirement",
        "accessSchedule",
        "reservationRequirement",
        "temporaryStatus",
        "location",
        "sources",
      ],
      requiredFields: [...REQUIRED_EDIT_FIELDS],
    },
  ] satisfies CampusMapEditPreset[],
  options: {
    gender: [
      { value: "unknown", label: "未知" },
      { value: "male", label: "男" },
      { value: "female", label: "女" },
      { value: "all-gender", label: "全性别" },
    ],
    wheelchairAccess: [
      { value: "unknown", label: "未知" },
      { value: "yes", label: "可通行" },
      { value: "limited", label: "部分受限" },
      { value: "no", label: "不可通行" },
    ],
    audience: [
      { value: "unknown", label: "未知" },
      { value: "public", label: "公众" },
      { value: "cuhk-member", label: "中大成员" },
      { value: "library-member", label: "图书馆成员" },
    ],
    credentialRequirement: [
      { value: "unknown", label: "未知" },
      { value: "none", label: "无需凭证" },
      { value: "campus-card", label: "校园卡" },
      { value: "library-card", label: "图书证" },
      { value: "other", label: "其他凭证" },
    ],
    accessSchedule: [
      { value: "unknown", label: "未知" },
      { value: "always", label: "全天开放" },
      { value: "weekly", label: "每周时段" },
    ],
    reservationRequirement: [
      { value: "unknown", label: "未知" },
      { value: "none", label: "无需预约" },
      { value: "required", label: "需要预约" },
    ],
    temporaryStatus: [
      { value: "unknown", label: "未知" },
      { value: "normal", label: "正常" },
      { value: "temporarily-closed", label: "暂时关闭" },
    ],
    capabilities: [
      { value: "print", label: "打印" },
      { value: "scan", label: "扫描" },
      { value: "copy", label: "复印" },
    ],
  },
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
