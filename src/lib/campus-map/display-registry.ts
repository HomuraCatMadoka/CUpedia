import type { CampusMapWeekday } from "@/db/schema";
import {
  CAMPUS_MAP_AUDIENCES,
  CAMPUS_MAP_CAPABILITIES,
  CAMPUS_MAP_CREDENTIAL_REQUIREMENTS,
  CAMPUS_MAP_GENDERS,
  CAMPUS_MAP_PLACE_PHOTO_ROLES,
  CAMPUS_MAP_PROVENANCE_KINDS,
  CAMPUS_MAP_RESERVATION_REQUIREMENTS,
  CAMPUS_MAP_TEMPORARY_STATUSES,
  CAMPUS_MAP_WHEELCHAIR_ACCESS,
} from "@/lib/campus-map/controlled-values";
import type {
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";

type LabelRecord<Values extends readonly string[]> = Record<
  Values[number],
  string
>;

function options<Values extends readonly string[]>(
  values: Values,
  labels: LabelRecord<Values>,
  unknownFirst = false,
) {
  const ordered = [...values] as Values[number][];
  if (unknownFirst) {
    ordered.sort(
      (left, right) => Number(right === "unknown") - Number(left === "unknown"),
    );
  }
  return ordered.map((value) => ({ value, label: labels[value] }));
}

const pinTypes = {
  toilet: { label: "洗手间" },
  water: { label: "饮水点" },
  printer: { label: "打印服务" },
  "common-space": { label: "公共空间" },
  classroom: { label: "课室" },
} satisfies Record<CampusMapPublishFactInput["pinType"], { label: string }>;

const capabilityLabels = {
  print: "打印",
  scan: "扫描",
  copy: "复印",
} satisfies LabelRecord<typeof CAMPUS_MAP_CAPABILITIES>;

const genderLabels = {
  male: "男",
  female: "女",
  "all-gender": "全性别",
  unknown: "未知",
} satisfies LabelRecord<typeof CAMPUS_MAP_GENDERS>;

const wheelchairAccessLabels = {
  yes: "可通行",
  limited: "部分受限",
  no: "不可通行",
  unknown: "未知",
} satisfies LabelRecord<typeof CAMPUS_MAP_WHEELCHAIR_ACCESS>;

const audienceLabels = {
  public: "公众",
  "cuhk-member": "中大成员",
  "library-member": "图书馆成员",
  unknown: "未知",
} satisfies LabelRecord<typeof CAMPUS_MAP_AUDIENCES>;

const credentialRequirementLabels = {
  none: "无需凭证",
  "campus-card": "校园卡",
  "library-card": "图书证",
  other: "其他凭证",
  unknown: "未知",
} satisfies LabelRecord<typeof CAMPUS_MAP_CREDENTIAL_REQUIREMENTS>;

const reservationRequirementLabels = {
  none: "无需预约",
  required: "需要预约",
  unknown: "未知",
} satisfies LabelRecord<typeof CAMPUS_MAP_RESERVATION_REQUIREMENTS>;

const temporaryStatusLabels = {
  normal: "正常",
  "temporarily-closed": "暂时关闭",
  unknown: "未知",
} satisfies LabelRecord<typeof CAMPUS_MAP_TEMPORARY_STATUSES>;

const provenanceKindLabels = {
  official: "官方资料",
  "field-observation": "现场观察",
  "open-data": "开放数据",
  "provider-candidate": "地图供应商候选",
  other: "其他资料",
} satisfies LabelRecord<typeof CAMPUS_MAP_PROVENANCE_KINDS>;

const placePhotoRoleLabels = {
  entrance: "入口",
  overview: "整体环境",
  interior: "内部",
  equipment: "设备",
  accessibility: "无障碍设施",
} satisfies LabelRecord<typeof CAMPUS_MAP_PLACE_PHOTO_ROLES>;

const accessScheduleKinds = ["unknown", "always", "weekly"] as const;
const accessScheduleLabels = {
  unknown: "未知",
  always: "全天开放",
  weekly: "每周时段",
} satisfies LabelRecord<typeof accessScheduleKinds>;

const browseCategories = [
  "water",
  "toilet",
  "printer",
  "common-space",
  "classroom",
] as const satisfies readonly CampusMapPublishFactInput["pinType"][];

/** Stable product vocabulary shared by Campus Map read and edit surfaces. */
export const CAMPUS_MAP_DISPLAY_REGISTRY = {
  fields: {
    name: { label: "名称" },
    buildingId: { label: "建筑" },
    floorId: { label: "楼层" },
    pinType: { label: "地点类型" },
    capabilities: { label: "服务能力" },
    gender: { label: "性别属性" },
    wheelchairAccess: { label: "无障碍通行" },
    audience: { label: "开放对象" },
    credentialRequirement: { label: "凭证要求" },
    accessSchedule: { label: "开放时间" },
    reservationRequirement: { label: "预约要求" },
    temporaryStatus: { label: "临时状态" },
    location: { label: "位置" },
    observedAt: { label: "观察时间" },
    sources: { label: "资料依据" },
  } satisfies Record<
    keyof CampusMapPublishFactInput | "sources",
    { label: string }
  >,
  pinTypes,
  browseCategories,
  options: {
    capabilities: options(CAMPUS_MAP_CAPABILITIES, capabilityLabels),
    gender: options(CAMPUS_MAP_GENDERS, genderLabels, true),
    wheelchairAccess: options(
      CAMPUS_MAP_WHEELCHAIR_ACCESS,
      wheelchairAccessLabels,
      true,
    ),
    audience: options(CAMPUS_MAP_AUDIENCES, audienceLabels, true),
    credentialRequirement: options(
      CAMPUS_MAP_CREDENTIAL_REQUIREMENTS,
      credentialRequirementLabels,
      true,
    ),
    accessSchedule: options(accessScheduleKinds, accessScheduleLabels),
    reservationRequirement: options(
      CAMPUS_MAP_RESERVATION_REQUIREMENTS,
      reservationRequirementLabels,
      true,
    ),
    temporaryStatus: options(
      CAMPUS_MAP_TEMPORARY_STATUSES,
      temporaryStatusLabels,
      true,
    ),
    provenanceKind: options(CAMPUS_MAP_PROVENANCE_KINDS, provenanceKindLabels),
  },
  weekdays: {
    mon: "周一",
    tue: "周二",
    wed: "周三",
    thu: "周四",
    fri: "周五",
    sat: "周六",
    sun: "周日",
  } satisfies Record<CampusMapWeekday, string>,
} as const;

export function campusMapPinTypeLabel(
  value: CampusMapPublishFactInput["pinType"],
) {
  return CAMPUS_MAP_DISPLAY_REGISTRY.pinTypes[value].label;
}

export function campusMapFactFieldLabel(
  value: keyof CampusMapPublishFactInput | "sources",
) {
  return CAMPUS_MAP_DISPLAY_REGISTRY.fields[value].label;
}

export function campusMapDisplayOptionLabel(
  group: keyof typeof CAMPUS_MAP_DISPLAY_REGISTRY.options,
  value: string,
) {
  const entries = CAMPUS_MAP_DISPLAY_REGISTRY.options[group] as readonly {
    value: string;
    label: string;
  }[];
  return entries.find((entry) => entry.value === value)?.label ?? value;
}

export function campusMapProvenanceKindLabel(
  value: CampusMapPublishSourceInput["kind"],
) {
  return campusMapDisplayOptionLabel("provenanceKind", value);
}

export function campusMapPlacePhotoRoleLabel(
  value: (typeof CAMPUS_MAP_PLACE_PHOTO_ROLES)[number],
) {
  return placePhotoRoleLabels[value];
}

const factOptionGroups = {
  capabilities: "capabilities",
  gender: "gender",
  wheelchairAccess: "wheelchairAccess",
  audience: "audience",
  credentialRequirement: "credentialRequirement",
  reservationRequirement: "reservationRequirement",
  temporaryStatus: "temporaryStatus",
} as const satisfies Partial<
  Record<
    keyof CampusMapPublishFactInput,
    keyof typeof CAMPUS_MAP_DISPLAY_REGISTRY.options
  >
>;

/** Formats controlled fact values while leaving version-specific shapes intact. */
export function displayCampusMapFactValue(field: string, value: unknown) {
  if (field === "pinType" && typeof value === "string") {
    return value in CAMPUS_MAP_DISPLAY_REGISTRY.pinTypes
      ? campusMapPinTypeLabel(value as CampusMapPublishFactInput["pinType"])
      : value;
  }
  const group = factOptionGroups[field as keyof typeof factOptionGroups];
  if (!group) return value;
  if (Array.isArray(value)) {
    return value.length > 0
      ? value
          .map((item) => campusMapDisplayOptionLabel(group, String(item)))
          .join("、")
      : value;
  }
  return typeof value === "string"
    ? campusMapDisplayOptionLabel(group, value)
    : value;
}
