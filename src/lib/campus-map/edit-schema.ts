import type { CampusMapPublishFactInput } from "./publish-contract";

export type CampusMapEditFieldKey =
  | "name"
  | "pinType"
  | "capabilities"
  | "gender"
  | "wheelchairAccess"
  | "audience"
  | "credentialRequirement"
  | "accessSchedule"
  | "reservationRequirement"
  | "temporaryStatus"
  | "location"
  | "sources";

export interface CampusMapEditOption<T extends string = string> {
  value: T;
  label: string;
}

export interface CampusMapEditPreset {
  pinType: CampusMapPublishFactInput["pinType"];
  label: string;
  defaultName: string;
  fields: CampusMapEditFieldKey[];
}

export const CAMPUS_MAP_EDIT_SCHEMA = {
  version: 1,
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
