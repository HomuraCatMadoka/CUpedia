import { type HkDistrictId } from "@/lib/food-map/districts";
import { projectLngLat } from "@/lib/food-map/geo-projection";
import { STATION_GEO } from "@/lib/food-map/station-geo";
import {
  MTR_JOURNEY_LINES,
  UNIVERSITY_30_MINUTE_TOPOLOGY,
  UNIVERSITY_JOURNEY_TIMES,
  type MtrJourneyLineCode,
  type UniversityJourneyStationCode,
} from "@/lib/food-map/university-journey-times";

export const FOOD_MAP_BUDGETS = [10, 20, 30] as const;

export type FoodMapBudget = (typeof FOOD_MAP_BUDGETS)[number];
export type MtrLineId = MtrJourneyLineCode;
export type MtrStationId = UniversityJourneyStationCode;
export type MapLabelAnchor = "start" | "middle" | "end";

export interface FoodMapSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  accessedOn: `${number}-${number}-${number}`;
  scope: string;
}

export interface MtrLine {
  id: MtrLineId;
  nameZh: string;
  nameEn: string;
  color: string;
}

export interface MtrStation {
  id: MtrStationId;
  nameZh: string;
  nameEn: string;
  minutes: number;
  lineIds: readonly MtrLineId[];
  districtId: HkDistrictId;
  areaZh: string;
  position: { x: number; y: number };
  label: { x: number; y: number; anchor: MapLabelAnchor };
  service?: "special-event";
}

export interface MtrSegment {
  from: MtrStationId;
  to: MtrStationId;
  lineId: MtrLineId;
  path: string;
  contextOnly?: boolean;
  special?: boolean;
  /** 共线走廊标记：渲染时按当前缩放动态偏移（保持屏幕恒定分离距）。 */
  parallel?: { index: number; count: number };
}

export type RestaurantPrice = "$" | "$$" | "$$$";

export interface MockRestaurant {
  id: string;
  stationId: MtrStationId;
  name: string;
  cuisine: string;
  price: RestaurantPrice;
  walkMinutes: number;
  note: string;
}

export const FOOD_MAP_ORIGIN_STATION_ID = "UNI" as const;

export const FOOD_MAP_SOURCES = [
  {
    id: "mtr-journey-planner-2026-07-30",
    title: "港铁行程指南",
    publisher: "香港铁路有限公司",
    url: "https://www.mtr.com.hk/ch/customer/jp/index.php",
    accessedOn: "2026-07-30",
    scope: "大学站出发的最短车程和路线快照",
  },
  {
    id: "mtr-system-map-2026-07-30",
    title: "港铁系统地图",
    publisher: "香港铁路有限公司",
    url: "https://www.mtr.com.hk/ch/customer/services/system_map.html",
    accessedOn: "2026-07-30",
    scope: "线路与转乘关系",
  },
  {
    id: "mtr-open-routes-2026-07-30",
    title: "港铁线路、车费及无障碍设施开放数据",
    publisher: "香港铁路有限公司",
    url: "https://data.gov.hk/en-data/dataset/mtr-data-routes-fares-barrier-free-facilities",
    accessedOn: "2026-07-30",
    scope: "线路与车站拓扑",
  },
  {
    id: "mtr-journey-time-notice-2026-07-30",
    title: "预计车程说明",
    publisher: "香港铁路有限公司",
    url: "https://www.mtr.com.hk/ch/customer/main/jp_cust_notice.html",
    accessedOn: "2026-07-30",
    scope: "预计车程口径",
  },
  {
    id: "had-district-boundaries-2026-07-30",
    title: "区议会分区",
    publisher: "民政事务总署",
    url: "https://www.had.gov.hk",
    accessedOn: "2026-07-30",
    scope: "车站所属区议会分区与地区名（分区定义口径）",
  },
  {
    id: "osm-coast-and-districts-2026-07-30",
    title: "海岸线与区界几何",
    publisher: "OpenStreetMap contributors (ODbL)",
    url: "https://www.openstreetmap.org/copyright",
    accessedOn: "2026-07-30",
    scope: "natural=coastline 海岸线与 admin_level=6 区界几何",
  },
] as const satisfies readonly FoodMapSource[];

const LINE_COLORS: Record<MtrLineId, string> = {
  EAL: "#5eb6e4",
  TML: "#9a3820",
  KTL: "#009b3a",
  TWL: "#dc1c2e",
};

export const MTR_LINES: readonly MtrLine[] = (
  Object.keys(MTR_JOURNEY_LINES) as MtrLineId[]
).map((id) => ({
  id,
  nameZh: MTR_JOURNEY_LINES[id].nameZhHans,
  nameEn: MTR_JOURNEY_LINES[id].nameEn,
  color: LINE_COLORS[id],
}));

/**
 * 车站所属区议会分区与地区名（民政事务总署 18 区口径）。
 * area 缺省时以站名作为地区名。
 */
const STATION_DISTRICTS: Record<
  MtrStationId,
  { district: HkDistrictId; area?: string }
> = {
  LOW: { district: "nc" },
  LMC: { district: "yl" },
  SHS: { district: "nc" },
  FAN: { district: "nc" },
  TWO: { district: "tp" },
  TAP: { district: "tp" },
  UNI: { district: "st", area: "马料水" },
  RAC: { district: "st", area: "沙田马场" },
  FOT: { district: "st" },
  SHT: { district: "st" },
  TAW: { district: "st" },
  MOS: { district: "st" },
  HEO: { district: "st" },
  TSH: { district: "st" },
  SHM: { district: "st" },
  CIO: { district: "st", area: "沙田第一城" },
  STW: { district: "st" },
  CKT: { district: "st", area: "沙田头" },
  HIK: { district: "st" },
  KOT: { district: "ktc" },
  HUH: { district: "ktc" },
  KAT: { district: "ktc" },
  SUW: { district: "ktc" },
  TKW: { district: "ktc" },
  HOM: { district: "ktc" },
  DIH: { district: "wts" },
  LOF: { district: "wts" },
  WTS: { district: "wts" },
  CHH: { district: "wts" },
  KOB: { district: "kt" },
  SKM: { district: "ssp" },
  SSP: { district: "ssp" },
  CSW: { district: "ssp" },
  LCK: { district: "ssp" },
  MKK: { district: "ytm" },
  PRE: { district: "ytm" },
  MOK: { district: "ytm" },
  YMT: { district: "ytm" },
  JOR: { district: "ytm" },
  ETS: { district: "ytm", area: "尖沙咀" },
  AUS: { district: "ytm", area: "西九龙" },
  EXC: { district: "wc", area: "湾仔北" },
  ADM: { district: "cw" },
};

const LABEL_OFFSET = 14;

function labelFor(
  position: { x: number; y: number },
  side: (typeof STATION_GEO)[MtrStationId]["labelSide"],
): MtrStation["label"] {
  switch (side) {
    case "left":
      return { x: position.x - LABEL_OFFSET, y: position.y, anchor: "end" };
    case "right":
      return { x: position.x + LABEL_OFFSET, y: position.y, anchor: "start" };
    case "above":
      return { x: position.x, y: position.y - LABEL_OFFSET, anchor: "middle" };
    case "below":
      return { x: position.x, y: position.y + LABEL_OFFSET, anchor: "middle" };
  }
}

const lineIdsByStation = new Map<MtrStationId, Set<MtrLineId>>();
for (const [lineId, branches] of Object.entries(
  UNIVERSITY_30_MINUTE_TOPOLOGY,
) as [MtrLineId, (typeof UNIVERSITY_30_MINUTE_TOPOLOGY)[MtrLineId]][]) {
  for (const branch of branches) {
    for (const code of branch.stationCodes) {
      const lines = lineIdsByStation.get(code) ?? new Set<MtrLineId>();
      lines.add(lineId);
      lineIdsByStation.set(code, lines);
    }
  }
}

export const MTR_STATIONS: readonly MtrStation[] = UNIVERSITY_JOURNEY_TIMES.map(
  (station) => {
    const geo = STATION_GEO[station.code];
    const placement = STATION_DISTRICTS[station.code];
    const position = projectLngLat(geo);
    return {
      id: station.code,
      nameZh: station.nameZhHans,
      nameEn: station.nameEn,
      minutes: station.minutes,
      lineIds: [...(lineIdsByStation.get(station.code) ?? [])],
      districtId: placement.district,
      areaZh: placement.area ?? station.nameZhHans,
      position,
      label: labelFor(position, geo.labelSide),
      ...("service" in station ? { service: station.service } : {}),
    };
  },
);

const stationPositionById = new Map(
  MTR_STATIONS.map((station) => [station.id, station.position]),
);

const round1 = (n: number) => Math.round(n * 10) / 10;

interface RawSegment {
  from: MtrStationId;
  to: MtrStationId;
  lineId: MtrLineId;
  special?: boolean;
}

const rawSegments: RawSegment[] = [];
for (const [lineId, branches] of Object.entries(
  UNIVERSITY_30_MINUTE_TOPOLOGY,
) as [MtrLineId, (typeof UNIVERSITY_30_MINUTE_TOPOLOGY)[MtrLineId]][]) {
  for (const branch of branches) {
    for (let index = 1; index < branch.stationCodes.length; index += 1) {
      rawSegments.push({
        from: branch.stationCodes[index - 1],
        to: branch.stationCodes[index],
        lineId,
        ...("service" in branch && branch.service
          ? { special: true as const }
          : {}),
      });
    }
  }
}

// 共线走廊（如 KTL/TWL 太子—旺角—油麻地）标记见 MtrSegment.parallel。
const pairCounts = new Map<string, number>();
for (const segment of rawSegments) {
  const key = [segment.from, segment.to].sort().join("|");
  pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
}
const pairDrawIndex = new Map<string, number>();

export const MTR_SEGMENTS: readonly MtrSegment[] = rawSegments.map(
  (segment) => {
    const from = stationPositionById.get(segment.from);
    const to = stationPositionById.get(segment.to);
    if (!from || !to) throw new Error(`Unknown segment ${segment.from}`);
    const key = [segment.from, segment.to].sort().join("|");
    const count = pairCounts.get(key) ?? 1;
    let parallel: MtrSegment["parallel"];
    if (count > 1) {
      const drawIndex = pairDrawIndex.get(key) ?? 0;
      pairDrawIndex.set(key, drawIndex + 1);
      parallel = { index: drawIndex, count };
    }
    return {
      from: segment.from,
      to: segment.to,
      lineId: segment.lineId,
      path: `M${round1(from.x)} ${round1(from.y)} L${round1(to.x)} ${round1(to.y)}`,
      ...(segment.special ? { special: true as const } : {}),
      ...(parallel ? { parallel } : {}),
    };
  },
);

const RESTAURANT_OVERRIDES: Partial<
  Record<MtrStationId, Omit<MockRestaurant, "stationId">>
> = {
  UNI: {
    id: "university-tea-counter",
    name: "范克廉楼",
    cuisine: "港式两餸饭",
    price: "$",
    walkMinutes: 5,
    note: "校内出发，适合快速解决一餐",
  },
  DIH: {
    id: "diamond-hill-roast-rice",
    name: "钻石山小馆",
    cuisine: "叉烧饭",
    price: "$$",
    walkMinutes: 5,
    note: "换乘后顺路，适合工作日简餐",
  },
  KOT: {
    id: "kowloon-tong-curry",
    name: "九龙塘食堂",
    cuisine: "日式咖喱饭",
    price: "$$",
    walkMinutes: 6,
    note: "邻近校园，座位较容易安排",
  },
  MOK: {
    id: "mong-kok-egg-rice",
    name: "旺角冰室",
    cuisine: "滑蛋叉烧饭",
    price: "$$",
    walkMinutes: 6,
    note: "适合放学后一起吃饭",
  },
  YMT: {
    id: "yau-ma-tei-claypot-rice",
    name: "油麻地小店",
    cuisine: "煲仔饭",
    price: "$$",
    walkMinutes: 7,
    note: "晚饭时段选择集中",
  },
  HUH: {
    id: "hung-hom-set-meal",
    name: "红磡冰室",
    cuisine: "港式常餐",
    price: "$",
    walkMinutes: 5,
    note: "路线直接，适合临时约饭",
  },
  ADM: {
    id: "admiralty-chicken-rice",
    name: "金钟小馆",
    cuisine: "海南鸡饭",
    price: "$$",
    walkMinutes: 8,
    note: "办公区午市选择集中",
  },
  MOS: {
    id: "ma-on-shan-roast-meat",
    name: "马鞍山街坊店",
    cuisine: "烧味双拼饭",
    price: "$$",
    walkMinutes: 8,
    note: "适合海滨散步后的晚餐",
  },
};

export const MOCK_RESTAURANTS: readonly MockRestaurant[] = MTR_STATIONS.map(
  (station) => ({
    stationId: station.id,
    id: `${station.id.toLowerCase()}-mock-meal`,
    name: `${station.nameZh}附近小店`,
    cuisine: "今日推荐饭",
    price: "$",
    walkMinutes: 5,
    note: "示例餐厅资料，之后可替换为真实饭店数据",
    ...RESTAURANT_OVERRIDES[station.id],
  }),
);

export function getReachableStations(budget: FoodMapBudget) {
  return MTR_STATIONS.filter((station) => station.minutes <= budget);
}

export function getRestaurantsForStation(stationId: MtrStationId) {
  return MOCK_RESTAURANTS.filter(
    (restaurant) => restaurant.stationId === stationId,
  );
}
