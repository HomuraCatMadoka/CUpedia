/**
 * 43 个车站的 WGS84 经纬度与站名标签方位（人工标注，OSM 精度级）。
 * 投影在 geo-projection.ts；校验：tests/lib/food-map.test.ts 的地理单调性断言。
 */

import type { MtrStationId } from "@/lib/food-map/data";

export type StationLabelSide = "left" | "right" | "above" | "below";

export interface StationGeo {
  lng: number;
  lat: number;
  labelSide: StationLabelSide;
}

export const STATION_GEO: Record<MtrStationId, StationGeo> = {
  // 东铁线
  LOW: { lng: 114.1134, lat: 22.5295, labelSide: "left" },
  LMC: { lng: 114.0728, lat: 22.5143, labelSide: "left" },
  SHS: { lng: 114.1279, lat: 22.5012, labelSide: "right" },
  FAN: { lng: 114.1394, lat: 22.4919, labelSide: "right" },
  TWO: { lng: 114.161, lat: 22.451, labelSide: "right" },
  TAP: { lng: 114.1702, lat: 22.4444, labelSide: "right" },
  UNI: { lng: 114.2103, lat: 22.4134, labelSide: "right" },
  RAC: { lng: 114.2024, lat: 22.3988, labelSide: "left" },
  FOT: { lng: 114.1983, lat: 22.3955, labelSide: "left" },
  SHT: { lng: 114.1875, lat: 22.3825, labelSide: "left" },
  TAW: { lng: 114.1784, lat: 22.373, labelSide: "left" },
  KOT: { lng: 114.1797, lat: 22.3373, labelSide: "left" },
  MKK: { lng: 114.1727, lat: 22.3217, labelSide: "right" },
  HUH: { lng: 114.1854, lat: 22.306, labelSide: "right" },
  EXC: { lng: 114.1765, lat: 22.283, labelSide: "right" },
  ADM: { lng: 114.1646, lat: 22.2787, labelSide: "left" },
  // 屯马线
  MOS: { lng: 114.2318, lat: 22.4248, labelSide: "right" },
  HEO: { lng: 114.2258, lat: 22.4174, labelSide: "right" },
  TSH: { lng: 114.2229, lat: 22.4089, labelSide: "right" },
  SHM: { lng: 114.2087, lat: 22.388, labelSide: "right" },
  CIO: { lng: 114.2033, lat: 22.3827, labelSide: "below" },
  STW: { lng: 114.1952, lat: 22.377, labelSide: "below" },
  CKT: { lng: 114.1858, lat: 22.3747, labelSide: "below" },
  HIK: { lng: 114.1704, lat: 22.363, labelSide: "left" },
  DIH: { lng: 114.2016, lat: 22.34, labelSide: "below" },
  KAT: { lng: 114.2, lat: 22.3285, labelSide: "right" },
  SUW: { lng: 114.1914, lat: 22.3257, labelSide: "below" },
  TKW: { lng: 114.1874, lat: 22.3169, labelSide: "below" },
  HOM: { lng: 114.1829, lat: 22.3095, labelSide: "right" },
  ETS: { lng: 114.1758, lat: 22.2952, labelSide: "right" },
  AUS: { lng: 114.1656, lat: 22.3043, labelSide: "above" },
  // 观塘线
  LOF: { lng: 114.1882, lat: 22.3393, labelSide: "below" },
  WTS: { lng: 114.1937, lat: 22.3417, labelSide: "above" },
  CHH: { lng: 114.2086, lat: 22.3349, labelSide: "below" },
  KOB: { lng: 114.214, lat: 22.3303, labelSide: "right" },
  SKM: { lng: 114.1691, lat: 22.332, labelSide: "above" },
  PRE: { lng: 114.1684, lat: 22.3234, labelSide: "left" },
  MOK: { lng: 114.1694, lat: 22.3191, labelSide: "left" },
  YMT: { lng: 114.1707, lat: 22.313, labelSide: "left" },
  // 荃湾线
  SSP: { lng: 114.1621, lat: 22.3307, labelSide: "above" },
  CSW: { lng: 114.1559, lat: 22.3355, labelSide: "above" },
  LCK: { lng: 114.1477, lat: 22.3374, labelSide: "above" },
  JOR: { lng: 114.1717, lat: 22.3049, labelSide: "left" },
};

/** 小地区文字锚点（muted，不上色）。 */
export interface AreaAnchor {
  name: string;
  lng: number;
  lat: number;
}

/**
 * 维多利亚港 + 九龙湾水面多边形（WGS84 环）。
 * GeoAtlas 区界把海域划进了沿岸各区，导致海渲染不出来；
 * 在区界之上叠这块水面把海「还」回来。手描自官方海岸线，仅作示意。
 */
export const HARBOUR_WATER: readonly { lng: number; lat: number }[] = [
  // 九龙岸线（西 → 东）
  { lng: 114.149, lat: 22.296 }, // 西九文化区海旁
  { lng: 114.162, lat: 22.295 }, // 尖沙咀西
  { lng: 114.172, lat: 22.293 }, // 尖沙咀咀尖
  { lng: 114.18, lat: 22.296 }, // 尖东
  { lng: 114.187, lat: 22.3 }, // 红磡湾
  { lng: 114.194, lat: 22.305 }, // 土瓜湾海旁
  { lng: 114.202, lat: 22.311 }, // 启德跑道根
  { lng: 114.218, lat: 22.307 }, // 启德跑道尖
  { lng: 114.223, lat: 22.313 }, // 九龙湾北岸
  { lng: 114.228, lat: 22.306 }, // 观塘海旁
  { lng: 114.238, lat: 22.295 }, // 油塘/茶果岭
  { lng: 114.255, lat: 22.292 }, // 鲤鱼门（画布东缘）
  // 港岛北岸（东 → 西）
  { lng: 114.255, lat: 22.28 }, // 爱秩序湾
  { lng: 114.235, lat: 22.284 }, // 西湾河
  { lng: 114.22, lat: 22.286 }, // 鲗鱼涌
  { lng: 114.2, lat: 22.29 }, // 北角
  { lng: 114.185, lat: 22.287 }, // 炮台山
  { lng: 114.172, lat: 22.281 }, // 会展/湾仔北
  { lng: 114.162, lat: 22.285 }, // 金钟/中环
  { lng: 114.15, lat: 22.287 }, // 上环/西营盘
  { lng: 114.14, lat: 22.288 }, // 坚尼地城（西面开口即西面海港）
];

/** 区名标注锚点（缺省用区界质心；密集区手调到空地）。 */
export const DISTRICT_LABEL_ANCHORS: Partial<
  Record<string, { lng: number; lat: number }>
> = {
  yl: { lng: 114.075, lat: 22.485 },
  st: { lng: 114.167, lat: 22.398 },
  ssp: { lng: 114.148, lat: 22.345 },
  ktc: { lng: 114.209, lat: 22.313 },
  wts: { lng: 114.199, lat: 22.355 },
  ytm: { lng: 114.153, lat: 22.2965 },
  cw: { lng: 114.15, lat: 22.281 },
  sd: { lng: 114.158, lat: 22.252 },
};

export const AREA_ANCHORS: readonly AreaAnchor[] = [];
