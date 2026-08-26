import type { CampusMapAmenity } from "./facility-marker";

export type AmapPrototypePosition = readonly [
  longitude: number,
  latitude: number,
];

export interface AmapPrototypeCoordinateProvenance {
  url: string;
  accessedOn: string;
  note: string;
}

export interface AmapPrototypeBuilding {
  id: string;
  name: string;
  englishName: string;
  code: string;
  position: AmapPrototypePosition;
  coordinateCrs: "wgs84";
  coordinateProvenance: AmapPrototypeCoordinateProvenance;
  aliases: readonly string[];
  amapPoiIds: readonly string[];
  amapHotspotNames: readonly string[];
  floorIds: readonly string[];
}

export interface AmapPrototypeFacility {
  id: string;
  buildingId: string;
  category: CampusMapAmenity;
  name: string;
  floorId: string;
  access: string;
  source: string;
  locationPrecision: "building";
}

const ACCESSED_ON = "2026-08-14";
const CURRENT_CUHK_MAP_URL =
  "https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html";
const ARCHIVED_CUHK_MAP_DATA_URL =
  "https://gist.github.com/seventhmoon/8234c5bbde540c2c33da";

export const AMAP_PROTOTYPE_BUILDINGS: readonly AmapPrototypeBuilding[] = [
  {
    id: "science-centre",
    name: "科学馆",
    englishName: "University Science Centre",
    code: "H10",
    position: [114.20801, 22.41966],
    coordinateCrs: "wgs84",
    coordinateProvenance: {
      url: CURRENT_CUHK_MAP_URL,
      accessedOn: ACCESSED_ON,
      note: "Approximate prototype anchor checked against the current CUHK Campus Map.",
    },
    aliases: [
      "科学馆",
      "科學館",
      "Science Centre",
      "University Science Centre",
    ],
    amapPoiIds: ["B0J2RXUQB6"],
    amapHotspotNames: [
      "科学馆",
      "科學館",
      "Science Centre",
      "ScienceCentre 科学馆",
      "University Science Centre",
    ],
    floorIds: ["LG", "G", "1", "2", "3", "4"],
  },
  {
    id: "wmy",
    name: "伍何曼原楼",
    englishName: "Wu Ho Man Yuen Building",
    code: "C39b",
    position: [114.21161413192749, 22.416696837628166],
    coordinateCrs: "wgs84",
    coordinateProvenance: {
      url: ARCHIVED_CUHK_MAP_DATA_URL,
      accessedOn: ACCESSED_ON,
      note: "Archived CUHK Campus Map building anchor, record C39b.",
    },
    aliases: ["伍何曼原楼", "Wu Ho Man Yuen Building", "WMY"],
    amapPoiIds: [],
    amapHotspotNames: ["伍何曼原楼", "Wu Ho Man Yuen Building"],
    floorIds: ["G", "1", "2", "3", "4", "5", "6"],
  },
  {
    id: "university-library",
    name: "大学图书馆",
    englishName: "University Library",
    code: "UL",
    position: [114.20491129159927, 22.419498675716074],
    coordinateCrs: "wgs84",
    coordinateProvenance: {
      url: ARCHIVED_CUHK_MAP_DATA_URL,
      accessedOn: ACCESSED_ON,
      note: "Archived CUHK Campus Map building anchor, record H3/building 5.",
    },
    aliases: ["大学图书馆", "大學圖書館", "University Library"],
    amapPoiIds: [],
    amapHotspotNames: ["大学图书馆", "大學圖書館", "University Library"],
    floorIds: ["G", "1", "2", "3", "4"],
  },
] as const;

export const AMAP_PROTOTYPE_FACILITIES: readonly AmapPrototypeFacility[] = [
  {
    id: "71000000-0000-4000-8000-000000000001",
    buildingId: "science-centre",
    category: "toilet",
    name: "洗手间",
    floorId: "LG",
    access: "公众可达",
    source: "CUHK 公开资料",
    locationPrecision: "building",
  },
  {
    id: "71000000-0000-4000-8000-000000000002",
    buildingId: "science-centre",
    category: "water",
    name: "饮水机",
    floorId: "1",
    access: "公众可达",
    source: "CUHK 公开资料",
    locationPrecision: "building",
  },
  {
    id: "71000000-0000-4000-8000-000000000003",
    buildingId: "wmy",
    category: "toilet",
    name: "洗手间",
    floorId: "5",
    access: "需 CUHK 身份",
    source: "CUHK 公开资料",
    locationPrecision: "building",
  },
  {
    id: "71000000-0000-4000-8000-000000000004",
    buildingId: "wmy",
    category: "printer",
    name: "打印站",
    floorId: "6",
    access: "需 CUHK 身份",
    source: "CUHK 公开资料",
    locationPrecision: "building",
  },
  {
    id: "71000000-0000-4000-8000-000000000005",
    buildingId: "university-library",
    category: "water",
    name: "饮水机",
    floorId: "G",
    access: "进入图书馆后可用",
    source: "CUHK 公开资料",
    locationPrecision: "building",
  },
] as const;

export const AMAP_PROTOTYPE_CAMPUS_CENTER: AmapPrototypePosition = [
  114.2072, 22.4191,
];
