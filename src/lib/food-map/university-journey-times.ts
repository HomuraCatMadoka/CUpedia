export type MtrJourneyLineCode = "EAL" | "TML" | "KTL" | "TWL";

export interface UniversityJourneyTimeStation {
  code: string;
  journeyPlannerId: number;
  nameZhHans: string;
  nameZhHant: string;
  nameEn: string;
  minutes: number;
  routeLines: readonly MtrJourneyLineCode[];
  service?: "special-event";
}

export const UNIVERSITY_JOURNEY_TIME_SOURCE = {
  publisher: "香港铁路有限公司",
  journeyPlannerUrl: "https://www.mtr.com.hk/ch/customer/jp/index.php",
  journeyPlannerEndpoint:
    "https://www.mtr.com.hk/share/customer/jp/api/HRRoutes/",
  topologyUrl: "https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv",
  accessedOn: "2026-07-30",
  originCode: "UNI",
  originJourneyPlannerId: 71,
  timeBasis:
    "平日早上时段的最短预计月台至月台车程，可能包括候车、乘车和转乘时间，不是实时或门到门时间。",
  snapshotPolicy:
    "官网行程指南所用接口并非公开稳定 API；此数据仅作为静态快照，不应由客户端在运行时批量请求。",
  audit: {
    journeyPlannerStationRecords: 102,
    uniqueStationCodes: 99,
    mtrStationCodesInScope: 98,
    destinationRecordsQueried: 101,
    successfulResponses: 101,
    failedResponses: 0,
  },
} as const;

export const MTR_JOURNEY_LINES = {
  EAL: {
    nameZhHans: "东铁线",
    nameZhHant: "東鐵綫",
    nameEn: "East Rail Line",
  },
  TML: {
    nameZhHans: "屯马线",
    nameZhHant: "屯馬綫",
    nameEn: "Tuen Ma Line",
  },
  KTL: {
    nameZhHans: "观塘线",
    nameZhHant: "觀塘綫",
    nameEn: "Kwun Tong Line",
  },
  TWL: {
    nameZhHans: "荃湾线",
    nameZhHant: "荃灣綫",
    nameEn: "Tsuen Wan Line",
  },
} as const satisfies Record<
  MtrJourneyLineCode,
  { nameZhHans: string; nameZhHant: string; nameEn: string }
>;

export const UNIVERSITY_JOURNEY_TIMES = [
  {
    code: "UNI",
    journeyPlannerId: 71,
    nameZhHans: "大学",
    nameZhHant: "大學",
    nameEn: "University",
    minutes: 0,
    routeLines: ["EAL"],
  },
  {
    code: "FOT",
    journeyPlannerId: 69,
    nameZhHans: "火炭",
    nameZhHant: "火炭",
    nameEn: "Fo Tan",
    minutes: 5,
    routeLines: ["EAL"],
  },
  {
    code: "SHT",
    journeyPlannerId: 68,
    nameZhHans: "沙田",
    nameZhHant: "沙田",
    nameEn: "Sha Tin",
    minutes: 7,
    routeLines: ["EAL"],
  },
  {
    code: "TAP",
    journeyPlannerId: 72,
    nameZhHans: "大埔墟",
    nameZhHant: "大埔墟",
    nameEn: "Tai Po Market",
    minutes: 7,
    routeLines: ["EAL"],
  },
  {
    code: "RAC",
    journeyPlannerId: 70,
    nameZhHans: "马场",
    nameZhHant: "馬場",
    nameEn: "Racecourse",
    minutes: 8,
    routeLines: ["EAL"],
    service: "special-event",
  },
  {
    code: "TWO",
    journeyPlannerId: 73,
    nameZhHans: "太和",
    nameZhHant: "太和",
    nameEn: "Tai Wo",
    minutes: 9,
    routeLines: ["EAL"],
  },
  {
    code: "TAW",
    journeyPlannerId: 67,
    nameZhHans: "大围",
    nameZhHant: "大圍",
    nameEn: "Tai Wai",
    minutes: 10,
    routeLines: ["EAL"],
  },
  {
    code: "FAN",
    journeyPlannerId: 74,
    nameZhHans: "粉岭",
    nameZhHant: "粉嶺",
    nameEn: "Fanling",
    minutes: 14,
    routeLines: ["EAL"],
  },
  {
    code: "KOT",
    journeyPlannerId: 8,
    nameZhHans: "九龙塘",
    nameZhHant: "九龍塘",
    nameEn: "Kowloon Tong",
    minutes: 14,
    routeLines: ["EAL"],
  },
  {
    code: "HIK",
    journeyPlannerId: 90,
    nameZhHans: "显径",
    nameZhHant: "顯徑",
    nameEn: "Hin Keng",
    minutes: 15,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "CKT",
    journeyPlannerId: 96,
    nameZhHans: "车公庙",
    nameZhHant: "車公廟",
    nameEn: "Che Kung Temple",
    minutes: 16,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "MKK",
    journeyPlannerId: 65,
    nameZhHans: "旺角东",
    nameZhHant: "旺角東",
    nameEn: "Mong Kok East",
    minutes: 16,
    routeLines: ["EAL"],
  },
  {
    code: "SHS",
    journeyPlannerId: 75,
    nameZhHans: "上水",
    nameZhHant: "上水",
    nameEn: "Sheung Shui",
    minutes: 16,
    routeLines: ["EAL"],
  },
  {
    code: "STW",
    journeyPlannerId: 97,
    nameZhHans: "沙田围",
    nameZhHant: "沙田圍",
    nameEn: "Sha Tin Wai",
    minutes: 18,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "CIO",
    journeyPlannerId: 98,
    nameZhHans: "第一城",
    nameZhHant: "第一城",
    nameEn: "City One",
    minutes: 20,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "DIH",
    journeyPlannerId: 11,
    nameZhHans: "钻石山",
    nameZhHant: "鑽石山",
    nameEn: "Diamond Hill",
    minutes: 20,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "HUH",
    journeyPlannerId: 64,
    nameZhHans: "红磡",
    nameZhHant: "紅磡",
    nameEn: "Hung Hom",
    minutes: 20,
    routeLines: ["EAL"],
  },
  {
    code: "LOF",
    journeyPlannerId: 9,
    nameZhHans: "乐富",
    nameZhHant: "樂富",
    nameEn: "Lok Fu",
    minutes: 21,
    routeLines: ["EAL", "KTL"],
  },
  {
    code: "LOW",
    journeyPlannerId: 76,
    nameZhHans: "罗湖",
    nameZhHant: "羅湖",
    nameEn: "Lo Wu",
    minutes: 21,
    routeLines: ["EAL"],
  },
  {
    code: "SHM",
    journeyPlannerId: 99,
    nameZhHans: "石门",
    nameZhHant: "石門",
    nameEn: "Shek Mun",
    minutes: 21,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "SKM",
    journeyPlannerId: 7,
    nameZhHans: "石硖尾",
    nameZhHant: "石硤尾",
    nameEn: "Shek Kip Mei",
    minutes: 21,
    routeLines: ["EAL", "KTL"],
  },
  {
    code: "KAT",
    journeyPlannerId: 91,
    nameZhHans: "启德",
    nameZhHant: "啟德",
    nameEn: "Kai Tak",
    minutes: 22,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "WTS",
    journeyPlannerId: 10,
    nameZhHans: "黄大仙",
    nameZhHant: "黃大仙",
    nameEn: "Wong Tai Sin",
    minutes: 22,
    routeLines: ["EAL", "KTL"],
  },
  {
    code: "PRE",
    journeyPlannerId: 16,
    nameZhHans: "太子",
    nameZhHant: "太子",
    nameEn: "Prince Edward",
    minutes: 23,
    routeLines: ["EAL", "KTL"],
  },
  {
    code: "EXC",
    journeyPlannerId: 94,
    nameZhHans: "会展",
    nameZhHant: "會展",
    nameEn: "Exhibition Centre",
    minutes: 24,
    routeLines: ["EAL"],
  },
  {
    code: "MOK",
    journeyPlannerId: 6,
    nameZhHans: "旺角",
    nameZhHant: "旺角",
    nameEn: "Mong Kok",
    minutes: 24,
    routeLines: ["EAL", "KTL"],
  },
  {
    code: "SUW",
    journeyPlannerId: 92,
    nameZhHans: "宋皇台",
    nameZhHant: "宋皇臺",
    nameEn: "Sung Wong Toi",
    minutes: 24,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "ADM",
    journeyPlannerId: 2,
    nameZhHans: "金钟",
    nameZhHant: "金鐘",
    nameEn: "Admiralty",
    minutes: 25,
    routeLines: ["EAL"],
  },
  {
    code: "ETS",
    journeyPlannerId: 80,
    nameZhHans: "尖东",
    nameZhHant: "尖東",
    nameEn: "East Tsim Sha Tsui",
    minutes: 25,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "HOM",
    journeyPlannerId: 84,
    nameZhHans: "何文田",
    nameZhHant: "何文田",
    nameEn: "Ho Man Tin",
    minutes: 25,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "TSH",
    journeyPlannerId: 100,
    nameZhHans: "大水坑",
    nameZhHant: "大水坑",
    nameEn: "Tai Shui Hang",
    minutes: 25,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "CHH",
    journeyPlannerId: 12,
    nameZhHans: "彩虹",
    nameZhHant: "彩虹",
    nameEn: "Choi Hung",
    minutes: 26,
    routeLines: ["EAL", "KTL"],
  },
  {
    code: "SSP",
    journeyPlannerId: 17,
    nameZhHans: "深水埗",
    nameZhHant: "深水埗",
    nameEn: "Sham Shui Po",
    minutes: 26,
    routeLines: ["EAL", "KTL", "TWL"],
  },
  {
    code: "TKW",
    journeyPlannerId: 93,
    nameZhHans: "土瓜湾",
    nameZhHant: "土瓜灣",
    nameEn: "To Kwa Wan",
    minutes: 26,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "YMT",
    journeyPlannerId: 5,
    nameZhHans: "油麻地",
    nameZhHant: "油麻地",
    nameEn: "Yau Ma Tei",
    minutes: 26,
    routeLines: ["EAL", "KTL"],
  },
  {
    code: "HEO",
    journeyPlannerId: 101,
    nameZhHans: "恒安",
    nameZhHant: "恆安",
    nameEn: "Heng On",
    minutes: 27,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "LMC",
    journeyPlannerId: 78,
    nameZhHans: "落马洲",
    nameZhHant: "落馬洲",
    nameEn: "Lok Ma Chau",
    minutes: 27,
    routeLines: ["EAL"],
  },
  {
    code: "AUS",
    journeyPlannerId: 111,
    nameZhHans: "柯士甸",
    nameZhHant: "柯士甸",
    nameEn: "Austin",
    minutes: 28,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "CSW",
    journeyPlannerId: 18,
    nameZhHans: "长沙湾",
    nameZhHant: "長沙灣",
    nameEn: "Cheung Sha Wan",
    minutes: 28,
    routeLines: ["EAL", "KTL", "TWL"],
  },
  {
    code: "KOB",
    journeyPlannerId: 13,
    nameZhHans: "九龙湾",
    nameZhHant: "九龍灣",
    nameEn: "Kowloon Bay",
    minutes: 29,
    routeLines: ["EAL", "KTL"],
  },
  {
    code: "MOS",
    journeyPlannerId: 102,
    nameZhHans: "马鞍山",
    nameZhHant: "馬鞍山",
    nameEn: "Ma On Shan",
    minutes: 29,
    routeLines: ["EAL", "TML"],
  },
  {
    code: "JOR",
    journeyPlannerId: 4,
    nameZhHans: "佐敦",
    nameZhHant: "佐敦",
    nameEn: "Jordan",
    minutes: 30,
    routeLines: ["EAL", "KTL", "TWL"],
  },
  {
    code: "LCK",
    journeyPlannerId: 19,
    nameZhHans: "荔枝角",
    nameZhHant: "荔枝角",
    nameEn: "Lai Chi Kok",
    minutes: 30,
    routeLines: ["EAL", "KTL", "TWL"],
  },
] as const satisfies readonly UniversityJourneyTimeStation[];

export type UniversityJourneyStationCode =
  (typeof UNIVERSITY_JOURNEY_TIMES)[number]["code"];

export interface UniversityRouteSegment {
  from: UniversityJourneyStationCode;
  to: UniversityJourneyStationCode;
  lineId: MtrJourneyLineCode;
}

export interface UniversityRoute {
  minutes: number;
  stationCodes: readonly UniversityJourneyStationCode[];
  segments: readonly UniversityRouteSegment[];
}

interface UniversityRouteSnapshot {
  stationCodes: readonly UniversityJourneyStationCode[];
  lineIds: readonly MtrJourneyLineCode[];
}

const UNIVERSITY_ROUTE_SNAPSHOT = {
  UNI: { stationCodes: ["UNI"], lineIds: [] },
  FOT: { stationCodes: ["UNI", "FOT"], lineIds: ["EAL"] },
  SHT: {
    stationCodes: ["UNI", "FOT", "SHT"],
    lineIds: ["EAL", "EAL"],
  },
  TAP: { stationCodes: ["UNI", "TAP"], lineIds: ["EAL"] },
  RAC: { stationCodes: ["UNI", "RAC"], lineIds: ["EAL"] },
  TWO: {
    stationCodes: ["UNI", "TAP", "TWO"],
    lineIds: ["EAL", "EAL"],
  },
  TAW: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW"],
    lineIds: ["EAL", "EAL", "EAL"],
  },
  FAN: {
    stationCodes: ["UNI", "TAP", "TWO", "FAN"],
    lineIds: ["EAL", "EAL", "EAL"],
  },
  KOT: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT"],
    lineIds: ["EAL", "EAL", "EAL", "EAL"],
  },
  HIK: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "HIK"],
    lineIds: ["EAL", "EAL", "EAL", "TML"],
  },
  CKT: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "CKT"],
    lineIds: ["EAL", "EAL", "EAL", "TML"],
  },
  MKK: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "MKK"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "EAL"],
  },
  SHS: {
    stationCodes: ["UNI", "TAP", "TWO", "FAN", "SHS"],
    lineIds: ["EAL", "EAL", "EAL", "EAL"],
  },
  STW: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "CKT", "STW"],
    lineIds: ["EAL", "EAL", "EAL", "TML", "TML"],
  },
  CIO: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "CKT", "STW", "CIO"],
    lineIds: ["EAL", "EAL", "EAL", "TML", "TML", "TML"],
  },
  DIH: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "HIK", "DIH"],
    lineIds: ["EAL", "EAL", "EAL", "TML", "TML"],
  },
  HUH: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "MKK", "HUH"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "EAL", "EAL"],
  },
  LOF: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "LOF"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL"],
  },
  LOW: {
    stationCodes: ["UNI", "TAP", "TWO", "FAN", "SHS", "LOW"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "EAL"],
  },
  SHM: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "CKT", "STW", "CIO", "SHM"],
    lineIds: ["EAL", "EAL", "EAL", "TML", "TML", "TML", "TML"],
  },
  SKM: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "SKM"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL"],
  },
  KAT: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "HIK", "DIH", "KAT"],
    lineIds: ["EAL", "EAL", "EAL", "TML", "TML", "TML"],
  },
  WTS: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "LOF", "WTS"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL"],
  },
  PRE: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "SKM", "PRE"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL"],
  },
  EXC: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "MKK", "HUH", "EXC"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "EAL", "EAL", "EAL"],
  },
  MOK: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "SKM", "PRE", "MOK"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL", "KTL"],
  },
  SUW: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "HIK", "DIH", "KAT", "SUW"],
    lineIds: ["EAL", "EAL", "EAL", "TML", "TML", "TML", "TML"],
  },
  ADM: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "KOT",
      "MKK",
      "HUH",
      "EXC",
      "ADM",
    ],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "EAL", "EAL", "EAL", "EAL"],
  },
  ETS: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "MKK", "HUH", "ETS"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "EAL", "EAL", "TML"],
  },
  HOM: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "MKK", "HUH", "HOM"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "EAL", "EAL", "TML"],
  },
  TSH: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "CKT",
      "STW",
      "CIO",
      "SHM",
      "TSH",
    ],
    lineIds: ["EAL", "EAL", "EAL", "TML", "TML", "TML", "TML", "TML"],
  },
  CHH: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "KOT",
      "LOF",
      "WTS",
      "DIH",
      "CHH",
    ],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL", "KTL", "KTL"],
  },
  SSP: {
    stationCodes: ["UNI", "FOT", "SHT", "TAW", "KOT", "SKM", "PRE", "SSP"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL", "TWL"],
  },
  TKW: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "HIK",
      "DIH",
      "KAT",
      "SUW",
      "TKW",
    ],
    lineIds: ["EAL", "EAL", "EAL", "TML", "TML", "TML", "TML", "TML"],
  },
  YMT: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "KOT",
      "SKM",
      "PRE",
      "MOK",
      "YMT",
    ],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL", "KTL", "KTL"],
  },
  HEO: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "CKT",
      "STW",
      "CIO",
      "SHM",
      "TSH",
      "HEO",
    ],
    lineIds: ["EAL", "EAL", "EAL", "TML", "TML", "TML", "TML", "TML", "TML"],
  },
  LMC: {
    stationCodes: ["UNI", "TAP", "TWO", "FAN", "SHS", "LMC"],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "EAL"],
  },
  AUS: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "KOT",
      "MKK",
      "HUH",
      "ETS",
      "AUS",
    ],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "EAL", "EAL", "TML", "TML"],
  },
  CSW: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "KOT",
      "SKM",
      "PRE",
      "SSP",
      "CSW",
    ],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL", "TWL", "TWL"],
  },
  KOB: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "KOT",
      "LOF",
      "WTS",
      "DIH",
      "CHH",
      "KOB",
    ],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL", "KTL", "KTL", "KTL"],
  },
  MOS: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "CKT",
      "STW",
      "CIO",
      "SHM",
      "TSH",
      "HEO",
      "MOS",
    ],
    lineIds: [
      "EAL",
      "EAL",
      "EAL",
      "TML",
      "TML",
      "TML",
      "TML",
      "TML",
      "TML",
      "TML",
    ],
  },
  JOR: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "KOT",
      "SKM",
      "PRE",
      "MOK",
      "YMT",
      "JOR",
    ],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL", "KTL", "TWL", "TWL"],
  },
  LCK: {
    stationCodes: [
      "UNI",
      "FOT",
      "SHT",
      "TAW",
      "KOT",
      "SKM",
      "PRE",
      "SSP",
      "CSW",
      "LCK",
    ],
    lineIds: ["EAL", "EAL", "EAL", "EAL", "KTL", "KTL", "TWL", "TWL", "TWL"],
  },
} as const satisfies Record<
  UniversityJourneyStationCode,
  UniversityRouteSnapshot
>;

const journeyTimeByCode = new Map(
  UNIVERSITY_JOURNEY_TIMES.map((station) => [station.code, station.minutes]),
);

export function getUniversityRoute(
  destination: UniversityJourneyStationCode,
): UniversityRoute {
  const snapshot = UNIVERSITY_ROUTE_SNAPSHOT[destination];

  return {
    minutes: journeyTimeByCode.get(destination) ?? 0,
    stationCodes: snapshot.stationCodes,
    segments: snapshot.lineIds.map((lineId, index) => ({
      from: snapshot.stationCodes[index],
      to: snapshot.stationCodes[index + 1],
      lineId,
    })),
  };
}

interface ReachableLineBranch {
  stationCodes: readonly UniversityJourneyStationCode[];
  service?: "special-event";
}

export const UNIVERSITY_30_MINUTE_TOPOLOGY = {
  EAL: [
    {
      stationCodes: [
        "LOW",
        "SHS",
        "FAN",
        "TWO",
        "TAP",
        "UNI",
        "FOT",
        "SHT",
        "TAW",
        "KOT",
        "MKK",
        "HUH",
        "EXC",
        "ADM",
      ],
    },
    { stationCodes: ["LMC", "SHS"] },
    {
      stationCodes: ["UNI", "RAC", "SHT"],
      service: "special-event",
    },
  ],
  TML: [
    {
      stationCodes: [
        "MOS",
        "HEO",
        "TSH",
        "SHM",
        "CIO",
        "STW",
        "CKT",
        "TAW",
        "HIK",
        "DIH",
        "KAT",
        "SUW",
        "TKW",
        "HOM",
        "HUH",
        "ETS",
        "AUS",
      ],
    },
  ],
  KTL: [
    {
      stationCodes: [
        "HOM",
        "YMT",
        "MOK",
        "PRE",
        "SKM",
        "KOT",
        "LOF",
        "WTS",
        "DIH",
        "CHH",
        "KOB",
      ],
    },
  ],
  TWL: [
    {
      stationCodes: ["LCK", "CSW", "SSP", "PRE", "MOK", "YMT", "JOR"],
    },
  ],
} as const satisfies Record<MtrJourneyLineCode, readonly ReachableLineBranch[]>;

export const UNIVERSITY_JOURNEY_TIME_COUNTS = {
  includingOriginAndSpecialService: {
    within10: 7,
    within20: 17,
    within30: 43,
  },
  regularServiceIncludingOrigin: {
    within10: 6,
    within20: 16,
    within30: 42,
  },
} as const;

export const UNIVERSITY_JOURNEY_TIME_NEXT_BOUNDARY = [
  {
    code: "CEN",
    nameZhHans: "中环",
    nameZhHant: "中環",
    nameEn: "Central",
    minutes: 31,
  },
  {
    code: "NAC",
    nameZhHans: "南昌",
    nameZhHant: "南昌",
    nameEn: "Nam Cheong",
    minutes: 31,
  },
  {
    code: "NTK",
    nameZhHans: "牛头角",
    nameZhHant: "牛頭角",
    nameEn: "Ngau Tau Kok",
    minutes: 31,
  },
  {
    code: "WAC",
    nameZhHans: "湾仔",
    nameZhHant: "灣仔",
    nameEn: "Wan Chai",
    minutes: 31,
  },
  {
    code: "WHA",
    nameZhHans: "黄埔",
    nameZhHant: "黃埔",
    nameEn: "Whampoa",
    minutes: 31,
  },
  {
    code: "WKS",
    nameZhHans: "乌溪沙",
    nameZhHant: "烏溪沙",
    nameEn: "Wu Kai Sha",
    minutes: 31,
  },
] as const;
