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
  position: { x: number; y: number };
  label: { x: number; y: number; anchor: MapLabelAnchor };
  labelSide: "left" | "right";
  service?: "special-event";
}

export interface MtrSegment {
  from: MtrStationId;
  to: MtrStationId;
  lineId: MtrLineId;
  path: string;
  contextOnly?: boolean;
  special?: boolean;
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

interface StationLayout {
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  anchor: MapLabelAnchor;
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

const STATION_LAYOUT: Record<MtrStationId, StationLayout> = {
  LOW: { x: 180, y: 25, labelX: 164, labelY: 25, anchor: "end" },
  LMC: { x: 280, y: 25, labelX: 296, labelY: 25, anchor: "start" },
  SHS: { x: 230, y: 70, labelX: 214, labelY: 70, anchor: "end" },
  FAN: { x: 230, y: 115, labelX: 214, labelY: 115, anchor: "end" },
  TWO: { x: 230, y: 160, labelX: 214, labelY: 160, anchor: "end" },
  TAP: { x: 230, y: 205, labelX: 214, labelY: 205, anchor: "end" },
  MOS: { x: 35, y: 235, labelX: 52, labelY: 235, anchor: "start" },
  UNI: { x: 230, y: 260, labelX: 252, labelY: 260, anchor: "start" },
  HEO: { x: 35, y: 280, labelX: 52, labelY: 280, anchor: "start" },
  FOT: { x: 230, y: 315, labelX: 214, labelY: 315, anchor: "end" },
  RAC: { x: 355, y: 315, labelX: 371, labelY: 315, anchor: "start" },
  TSH: { x: 35, y: 325, labelX: 52, labelY: 325, anchor: "start" },
  SHT: { x: 230, y: 365, labelX: 214, labelY: 365, anchor: "end" },
  SHM: { x: 35, y: 370, labelX: 52, labelY: 358, anchor: "start" },
  CIO: { x: 60, y: 415, labelX: 60, labelY: 391, anchor: "middle" },
  STW: { x: 115, y: 415, labelX: 115, labelY: 442, anchor: "middle" },
  CKT: { x: 170, y: 415, labelX: 170, labelY: 391, anchor: "middle" },
  TAW: { x: 230, y: 415, labelX: 244, labelY: 438, anchor: "start" },
  HIK: { x: 290, y: 415, labelX: 290, labelY: 391, anchor: "middle" },
  KOT: { x: 230, y: 485, labelX: 214, labelY: 500, anchor: "end" },
  LOF: { x: 270, y: 485, labelX: 270, labelY: 462, anchor: "middle" },
  WTS: { x: 310, y: 485, labelX: 310, labelY: 512, anchor: "middle" },
  DIH: { x: 350, y: 485, labelX: 350, labelY: 462, anchor: "middle" },
  CHH: { x: 395, y: 485, labelX: 395, labelY: 512, anchor: "middle" },
  KOB: { x: 435, y: 525, labelX: 468, labelY: 545, anchor: "end" },
  SKM: { x: 190, y: 535, labelX: 174, labelY: 535, anchor: "end" },
  KAT: { x: 350, y: 535, labelX: 366, labelY: 535, anchor: "start" },
  MKK: { x: 230, y: 545, labelX: 246, labelY: 545, anchor: "start" },
  SSP: { x: 100, y: 585, labelX: 100, labelY: 610, anchor: "middle" },
  CSW: { x: 60, y: 585, labelX: 60, labelY: 562, anchor: "middle" },
  PRE: { x: 150, y: 585, labelX: 163, labelY: 562, anchor: "start" },
  SUW: { x: 350, y: 585, labelX: 366, labelY: 585, anchor: "start" },
  LCK: { x: 25, y: 625, labelX: 14, labelY: 647, anchor: "start" },
  MOK: { x: 110, y: 635, labelX: 126, labelY: 635, anchor: "start" },
  TKW: { x: 350, y: 635, labelX: 366, labelY: 635, anchor: "start" },
  HOM: { x: 300, y: 675, labelX: 316, labelY: 675, anchor: "start" },
  YMT: { x: 70, y: 685, labelX: 86, labelY: 685, anchor: "start" },
  HUH: { x: 230, y: 705, labelX: 214, labelY: 705, anchor: "end" },
  JOR: { x: 30, y: 735, labelX: 46, labelY: 735, anchor: "start" },
  ETS: { x: 285, y: 755, labelX: 301, labelY: 755, anchor: "start" },
  EXC: { x: 230, y: 765, labelX: 214, labelY: 765, anchor: "end" },
  AUS: { x: 340, y: 805, labelX: 356, labelY: 805, anchor: "start" },
  ADM: { x: 230, y: 825, labelX: 214, labelY: 825, anchor: "end" },
};

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
    const layout = STATION_LAYOUT[station.code];
    return {
      id: station.code,
      nameZh: station.nameZhHans,
      nameEn: station.nameEn,
      minutes: station.minutes,
      lineIds: [...(lineIdsByStation.get(station.code) ?? [])],
      position: { x: layout.x, y: layout.y },
      label: {
        x: layout.labelX,
        y: layout.labelY,
        anchor: layout.anchor,
      },
      labelSide: layout.anchor === "end" ? "left" : "right",
      ...("service" in station ? { service: station.service } : {}),
    };
  },
);

export const MTR_SEGMENTS: readonly MtrSegment[] = [
  { from: "SHS", to: "LOW", lineId: "EAL", path: "M230 70 L180 25" },
  { from: "SHS", to: "LMC", lineId: "EAL", path: "M230 70 L280 25" },
  { from: "FAN", to: "SHS", lineId: "EAL", path: "M230 115 V70" },
  { from: "TWO", to: "FAN", lineId: "EAL", path: "M230 160 V115" },
  { from: "TAP", to: "TWO", lineId: "EAL", path: "M230 205 V160" },
  { from: "UNI", to: "TAP", lineId: "EAL", path: "M230 260 V205" },
  { from: "UNI", to: "FOT", lineId: "EAL", path: "M230 260 V315" },
  { from: "FOT", to: "SHT", lineId: "EAL", path: "M230 315 V365" },
  { from: "SHT", to: "TAW", lineId: "EAL", path: "M230 365 V415" },
  { from: "TAW", to: "KOT", lineId: "EAL", path: "M230 415 V485" },
  { from: "KOT", to: "MKK", lineId: "EAL", path: "M230 485 V545" },
  { from: "MKK", to: "HUH", lineId: "EAL", path: "M230 545 V705" },
  { from: "HUH", to: "EXC", lineId: "EAL", path: "M230 705 V765" },
  { from: "EXC", to: "ADM", lineId: "EAL", path: "M230 765 V825" },
  {
    from: "UNI",
    to: "RAC",
    lineId: "EAL",
    path: "M230 260 H326 Q355 260 355 289 V315",
    special: true,
  },
  { from: "TAW", to: "CKT", lineId: "TML", path: "M230 415 H170" },
  { from: "CKT", to: "STW", lineId: "TML", path: "M170 415 H115" },
  { from: "STW", to: "CIO", lineId: "TML", path: "M115 415 H60" },
  { from: "CIO", to: "SHM", lineId: "TML", path: "M60 415 L35 370" },
  { from: "SHM", to: "TSH", lineId: "TML", path: "M35 370 V325" },
  { from: "TSH", to: "HEO", lineId: "TML", path: "M35 325 V280" },
  { from: "HEO", to: "MOS", lineId: "TML", path: "M35 280 V235" },
  { from: "TAW", to: "HIK", lineId: "TML", path: "M230 415 H290" },
  { from: "HIK", to: "DIH", lineId: "TML", path: "M290 415 L350 485" },
  { from: "DIH", to: "KAT", lineId: "TML", path: "M350 485 V535" },
  { from: "KAT", to: "SUW", lineId: "TML", path: "M350 535 V585" },
  { from: "SUW", to: "TKW", lineId: "TML", path: "M350 585 V635" },
  {
    from: "TKW",
    to: "HOM",
    lineId: "TML",
    path: "M350 635 L300 675",
    contextOnly: true,
  },
  { from: "HOM", to: "HUH", lineId: "TML", path: "M300 675 L230 705" },
  { from: "HUH", to: "ETS", lineId: "TML", path: "M230 705 L285 755" },
  { from: "ETS", to: "AUS", lineId: "TML", path: "M285 755 L340 805" },
  { from: "KOT", to: "LOF", lineId: "KTL", path: "M230 485 H270" },
  { from: "LOF", to: "WTS", lineId: "KTL", path: "M270 485 H310" },
  { from: "WTS", to: "DIH", lineId: "KTL", path: "M310 485 H350" },
  { from: "DIH", to: "CHH", lineId: "KTL", path: "M350 485 H395" },
  { from: "CHH", to: "KOB", lineId: "KTL", path: "M395 485 L435 525" },
  { from: "KOT", to: "SKM", lineId: "KTL", path: "M230 485 L190 535" },
  { from: "SKM", to: "PRE", lineId: "KTL", path: "M190 535 L150 585" },
  { from: "PRE", to: "MOK", lineId: "KTL", path: "M150 585 L110 635" },
  { from: "MOK", to: "YMT", lineId: "KTL", path: "M110 635 L70 685" },
  { from: "PRE", to: "SSP", lineId: "TWL", path: "M150 585 H100" },
  { from: "SSP", to: "CSW", lineId: "TWL", path: "M100 585 H60" },
  { from: "CSW", to: "LCK", lineId: "TWL", path: "M60 585 L25 625" },
  {
    from: "PRE",
    to: "MOK",
    lineId: "TWL",
    path: "M153 588 L113 638",
    contextOnly: true,
  },
  { from: "MOK", to: "YMT", lineId: "TWL", path: "M113 638 L73 688" },
  { from: "YMT", to: "JOR", lineId: "TWL", path: "M70 685 L30 735" },
];

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
  SHT: {
    id: "sht-mock-meal",
    name: "新城市茶冰厅",
    cuisine: "港式茶餐厅",
    price: "$$",
    walkMinutes: 4,
    note: "沙田站附近的既有打卡示例",
  },
  TAP: {
    id: "tap-mock-meal",
    name: "墟市鱼蛋粉",
    cuisine: "潮州粉面",
    price: "$",
    walkMinutes: 5,
    note: "大埔墟站附近的既有打卡示例",
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
