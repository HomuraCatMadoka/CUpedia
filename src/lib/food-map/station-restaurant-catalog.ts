export type FoodleStationId = "SHT" | "TAP";
export type RestaurantOpeningState = "open" | "closed" | "unknown";
export type RestaurantHeat = "quiet" | "known" | "popular" | "hot";

export interface RestaurantSourceMetadata {
  provider: "openrice";
  externalId: string;
  url: string;
  acquiredAt: string;
  updatedAt: string;
}

export interface RestaurantOpeningPeriod {
  days: readonly number[];
  opens: `${number}:${number}`;
  closes: `${number}:${number}`;
}

export interface RestaurantSourceFacts {
  name: string;
  cuisines: readonly string[] | null;
  averagePriceHkd: number | null;
  priceRange: string | null;
  openingPeriods: readonly RestaurantOpeningPeriod[] | null;
}

export interface RestaurantLocation {
  latitude: number;
  longitude: number;
  address: string;
  nearestExit: string;
  distanceMeters: number;
}

export interface FoodleComment {
  id: string;
  body: string;
  visitedOn: string;
}

export interface FoodleRestaurantFacts {
  stationId: FoodleStationId;
  walkMinutes: number | null;
  averageScore: number | null;
  uniqueVisitors: number | null;
  totalCheckins: number;
  summary: string;
  comments: readonly FoodleComment[];
}

export interface FoodleRestaurant {
  id: string;
  source: RestaurantSourceMetadata;
  sourceFacts: RestaurantSourceFacts;
  location: RestaurantLocation;
  foodle: FoodleRestaurantFacts;
}

export interface FoodleStationMap {
  id: FoodleStationId;
  nameZh: string;
  nameEn: string;
  center: readonly [longitude: number, latitude: number];
  radiusMeters: number;
}

export interface RestaurantOpeningStatus {
  state: RestaurantOpeningState;
  label: string;
}

const SNAPSHOT_TIME = "2026-07-31T08:00:00+08:00";
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;
const HKT = "Asia/Hong_Kong";

export const FOODLE_STATION_MAPS: Record<FoodleStationId, FoodleStationMap> = {
  SHT: {
    id: "SHT",
    nameZh: "沙田",
    nameEn: "Sha Tin",
    center: [114.1887, 22.3828],
    radiusMeters: 500,
  },
  TAP: {
    id: "TAP",
    nameZh: "大埔墟",
    nameEn: "Tai Po Market",
    center: [114.1707, 22.4445],
    radiusMeters: 500,
  },
};

function mockRestaurant(
  id: string,
  externalId: string,
  stationId: FoodleStationId,
  sourceFacts: RestaurantSourceFacts,
  location: RestaurantLocation,
  foodleFacts: Omit<FoodleRestaurantFacts, "stationId">,
): FoodleRestaurant {
  return {
    id,
    source: {
      provider: "openrice",
      externalId,
      url: `https://www.openrice.com/zh/hongkong/r/${externalId}`,
      acquiredAt: SNAPSHOT_TIME,
      updatedAt: SNAPSHOT_TIME,
    },
    sourceFacts,
    location,
    foodle: { stationId, ...foodleFacts },
  };
}

export const FOODLE_STATION_RESTAURANTS: readonly FoodleRestaurant[] = [
  mockRestaurant(
    "sht-mock-meal",
    "mock-sht-001",
    "SHT",
    {
      name: "新城市茶冰厅",
      cuisines: ["港式", "茶餐厅"],
      averagePriceHkd: 72,
      priceRange: "HK$51 至 100",
      openingPeriods: [{ days: EVERY_DAY, opens: "07:30", closes: "22:00" }],
    },
    {
      latitude: 22.3818,
      longitude: 114.1889,
      address: "沙田正街 18 号新城市广场一期",
      nearestExit: "A 出口",
      distanceMeters: 180,
    },
    {
      walkMinutes: 4,
      averageScore: 4.2,
      uniqueVisitors: 31,
      totalCheckins: 58,
      summary: "赶时间也能坐下来吃的一顿港式常餐。",
      comments: [
        {
          id: "sht-c1",
          body: "午市出餐快，冻奶茶偏甜。",
          visitedOn: "2026-07-29",
        },
        {
          id: "sht-c2",
          body: "从 A 出口走过去很顺路。",
          visitedOn: "2026-07-24",
        },
      ],
    },
  ),
  mockRestaurant(
    "foodle-sht-002",
    "mock-sht-002",
    "SHT",
    {
      name: "城河米线",
      cuisines: ["滇菜", "米线"],
      averagePriceHkd: 48,
      priceRange: "HK$50 以下",
      openingPeriods: [{ days: EVERY_DAY, opens: "11:00", closes: "21:30" }],
    },
    {
      latitude: 22.3841,
      longitude: 114.1895,
      address: "沙田横壆街 1 号好运中心",
      nearestExit: "B 出口",
      distanceMeters: 260,
    },
    {
      walkMinutes: 6,
      averageScore: 4.5,
      uniqueVisitors: 46,
      totalCheckins: 83,
      summary: "汤底选择多，一个人吃也很轻松。",
      comments: [
        {
          id: "sht-c3",
          body: "小辣已经够香，配料份量实在。",
          visitedOn: "2026-07-30",
        },
      ],
    },
  ),
  mockRestaurant(
    "foodle-sht-003",
    "mock-sht-003",
    "SHT",
    {
      name: "瀛月鮨",
      cuisines: ["日本菜", "寿司"],
      averagePriceHkd: 260,
      priceRange: "HK$201 至 400",
      openingPeriods: [{ days: EVERY_DAY, opens: "11:30", closes: "22:30" }],
    },
    {
      latitude: 22.3808,
      longitude: 114.1904,
      address: "沙田车站围 1 号连城广场",
      nearestExit: "A 出口",
      distanceMeters: 320,
    },
    {
      walkMinutes: 8,
      averageScore: 4,
      uniqueVisitors: 12,
      totalCheckins: 17,
      summary: "预算充足时的安静晚餐选择。",
      comments: [],
    },
  ),
  mockRestaurant(
    "foodle-sht-004",
    "mock-sht-004",
    "SHT",
    {
      name: "橙路咖啡",
      cuisines: ["咖啡店"],
      averagePriceHkd: 68,
      priceRange: "HK$51 至 100",
      openingPeriods: null,
    },
    {
      latitude: 22.3851,
      longitude: 114.1871,
      address: "沙田沙田围路 9 号田园阁",
      nearestExit: "B 出口",
      distanceMeters: 410,
    },
    {
      walkMinutes: 9,
      averageScore: null,
      uniqueVisitors: null,
      totalCheckins: 4,
      summary: "适合饭后继续坐一会的小咖啡店。",
      comments: [],
    },
  ),
  mockRestaurant(
    "tap-mock-meal",
    "mock-tap-001",
    "TAP",
    {
      name: "墟市鱼蛋粉",
      cuisines: ["潮州菜", "粉面"],
      averagePriceHkd: 42,
      priceRange: "HK$50 以下",
      openingPeriods: [{ days: EVERY_DAY, opens: "07:00", closes: "20:30" }],
    },
    {
      latitude: 22.4452,
      longitude: 114.1694,
      address: "大埔运头街 12 号",
      nearestExit: "A3 出口",
      distanceMeters: 190,
    },
    {
      walkMinutes: 5,
      averageScore: 4.6,
      uniqueVisitors: 53,
      totalCheckins: 96,
      summary: "一出站就能吃到的街坊粉面。",
      comments: [
        {
          id: "tap-c1",
          body: "鱼蛋弹牙，下午去不用等位。",
          visitedOn: "2026-07-28",
        },
      ],
    },
  ),
  mockRestaurant(
    "foodle-tap-002",
    "mock-tap-002",
    "TAP",
    {
      name: "广福烧味",
      cuisines: ["粤菜", "烧味"],
      averagePriceHkd: 46,
      priceRange: "HK$50 以下",
      openingPeriods: [{ days: EVERY_DAY, opens: "10:30", closes: "21:00" }],
    },
    {
      latitude: 22.4433,
      longitude: 114.1688,
      address: "大埔广福道 33 号",
      nearestExit: "A2 出口",
      distanceMeters: 310,
    },
    {
      walkMinutes: 7,
      averageScore: 4.1,
      uniqueVisitors: 27,
      totalCheckins: 41,
      summary: "想快速解决一餐时很稳妥的烧味饭。",
      comments: [],
    },
  ),
  mockRestaurant(
    "foodle-tap-003",
    "mock-tap-003",
    "TAP",
    {
      name: "后巷泰厨房",
      cuisines: ["泰国菜"],
      averagePriceHkd: 138,
      priceRange: "HK$101 至 200",
      openingPeriods: [{ days: EVERY_DAY, opens: "11:30", closes: "22:00" }],
    },
    {
      latitude: 22.4465,
      longitude: 114.1721,
      address: "大埔乡事会街 8 号",
      nearestExit: "B 出口",
      distanceMeters: 360,
    },
    {
      walkMinutes: 9,
      averageScore: 4.3,
      uniqueVisitors: 18,
      totalCheckins: 29,
      summary: "适合两三个人分着吃的泰式小馆。",
      comments: [],
    },
  ),
  mockRestaurant(
    "foodle-tap-004",
    "mock-tap-004",
    "TAP",
    {
      name: "铁路旁烘焙室",
      cuisines: null,
      averagePriceHkd: null,
      priceRange: null,
      openingPeriods: null,
    },
    {
      latitude: 22.4422,
      longitude: 114.1727,
      address: "大埔雅运路 6 号",
      nearestExit: "B 出口",
      distanceMeters: 470,
    },
    {
      walkMinutes: null,
      averageScore: null,
      uniqueVisitors: 3,
      totalCheckins: 5,
      summary: "资料仍在补全的社区烘焙店。",
      comments: [],
    },
  ),
];

function minutesSinceMidnight(value: string) {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function hktClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HKT,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    value("weekday"),
  );

  return {
    weekday,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

export function getRestaurantOpeningStatus(
  restaurant: FoodleRestaurant,
  now: Date = new Date(),
): RestaurantOpeningStatus {
  const periods = restaurant.sourceFacts.openingPeriods;
  if (!periods || periods.length === 0) {
    return { state: "unknown", label: "营业时间待补全" };
  }

  const clock = hktClock(now);
  for (const period of periods) {
    const opens = minutesSinceMidnight(period.opens);
    const closes = minutesSinceMidnight(period.closes);
    const normalDay = opens < closes;
    const openToday = period.days.includes(clock.weekday);
    const openFromYesterday = period.days.includes((clock.weekday + 6) % 7);
    const isOpen = normalDay
      ? openToday && clock.minutes >= opens && clock.minutes < closes
      : (openToday && clock.minutes >= opens) ||
        (openFromYesterday && clock.minutes < closes);

    if (isOpen) {
      return { state: "open", label: `营业中 · ${period.closes} 关门` };
    }
  }

  return { state: "closed", label: "已休息 · 查看营业时间" };
}

export function getRestaurantHeat(totalCheckins: number): RestaurantHeat {
  if (totalCheckins >= 90) return "hot";
  if (totalCheckins >= 60) return "popular";
  if (totalCheckins >= 20) return "known";
  return "quiet";
}

export function getFoodleRestaurantsForStation(stationId: FoodleStationId) {
  return FOODLE_STATION_RESTAURANTS.filter(
    (restaurant) => restaurant.foodle.stationId === stationId,
  );
}

export function isFoodleStationId(value: string): value is FoodleStationId {
  return value === "SHT" || value === "TAP";
}
