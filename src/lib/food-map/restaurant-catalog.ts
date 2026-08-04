import type { MtrStationId } from "@/lib/food-map/data";

export type RestaurantOpeningState = "open" | "closed" | "unknown";

export interface RestaurantSourceMetadata {
  provider: "openrice";
  externalId: string;
  url: string | null;
  imageUrls: readonly string[];
  acquiredAt: string;
  updatedAt: string;
}

export interface RestaurantSourceFacts {
  name: string;
  cuisines: readonly string[] | null;
  priceRange: string | null;
  openingState: RestaurantOpeningState;
  openingLabel: string | null;
}

export interface FoodleRestaurantFacts {
  stationId: MtrStationId;
  walkMinutes: number | null;
  averageScore: number | null;
  uniqueVisitors: number | null;
  totalCheckins: number | null;
}

export interface FoodleRestaurant {
  id: string;
  source: RestaurantSourceMetadata;
  sourceFacts: RestaurantSourceFacts;
  foodle: FoodleRestaurantFacts;
}

const SNAPSHOT_TIME = "2026-07-31T08:00:00+08:00";

function mockRestaurant(
  id: string,
  externalId: string,
  stationId: MtrStationId,
  sourceFacts: RestaurantSourceFacts,
  foodleFacts: Omit<FoodleRestaurantFacts, "stationId">,
  sourceOptions: {
    url?: string | null;
    imageUrls?: readonly string[];
  } = {},
): FoodleRestaurant {
  return {
    id,
    source: {
      provider: "openrice",
      externalId,
      url:
        sourceOptions.url === undefined
          ? `https://www.openrice.com/zh/hongkong/r/${externalId}`
          : sourceOptions.url,
      imageUrls: sourceOptions.imageUrls ?? [],
      acquiredAt: SNAPSHOT_TIME,
      updatedAt: SNAPSHOT_TIME,
    },
    sourceFacts,
    foodle: { stationId, ...foodleFacts },
  };
}

export const FOODLE_RESTAURANTS: readonly FoodleRestaurant[] = [
  mockRestaurant(
    "sht-mock-meal",
    "mock-sht-001",
    "SHT",
    {
      name: "新城市茶冰厅",
      cuisines: ["港式", "茶餐厅"],
      priceRange: "HK$51 至 100",
      openingState: "open",
      openingLabel: "营业中，22:00 关门",
    },
    {
      walkMinutes: 4,
      averageScore: 4.2,
      uniqueVisitors: 31,
      totalCheckins: 58,
    },
    {
      imageUrls: [
        "/foodle-sketch/cha-chaan-teng-meal.svg",
        "/foodle-sketch/cha-chaan-teng-shop.svg",
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
      priceRange: "HK$50 以下",
      openingState: "open",
      openingLabel: "营业中，21:30 关门",
    },
    {
      walkMinutes: 6,
      averageScore: 4.5,
      uniqueVisitors: 46,
      totalCheckins: 83,
    },
    { imageUrls: ["/foodle-sketch/noodle-bowl.svg"] },
  ),
  mockRestaurant(
    "foodle-sht-003",
    "mock-sht-003",
    "SHT",
    {
      name: "瀛月鮨",
      cuisines: ["日本菜", "寿司"],
      priceRange: "HK$201 至 400",
      openingState: "closed",
      openingLabel: "已休息，明日 11:30 营业",
    },
    {
      walkMinutes: 8,
      averageScore: 4.0,
      uniqueVisitors: 12,
      totalCheckins: 17,
    },
  ),
  mockRestaurant(
    "foodle-sht-004",
    "mock-sht-004",
    "SHT",
    {
      name: "橙路咖啡",
      cuisines: ["咖啡店"],
      priceRange: "HK$51 至 100",
      openingState: "unknown",
      openingLabel: null,
    },
    {
      walkMinutes: 9,
      averageScore: null,
      uniqueVisitors: null,
      totalCheckins: 4,
    },
  ),
  mockRestaurant(
    "tap-mock-meal",
    "mock-tap-001",
    "TAP",
    {
      name: "墟市鱼蛋粉",
      cuisines: ["潮州菜", "粉面"],
      priceRange: "HK$50 以下",
      openingState: "open",
      openingLabel: "营业中，20:30 关门",
    },
    {
      walkMinutes: 5,
      averageScore: 4.6,
      uniqueVisitors: 53,
      totalCheckins: 96,
    },
  ),
  mockRestaurant(
    "foodle-tap-002",
    "mock-tap-002",
    "TAP",
    {
      name: "广福烧味",
      cuisines: ["粤菜", "烧味"],
      priceRange: "HK$50 以下",
      openingState: "open",
      openingLabel: "营业中，21:00 关门",
    },
    {
      walkMinutes: 7,
      averageScore: 4.1,
      uniqueVisitors: 27,
      totalCheckins: 41,
    },
  ),
  mockRestaurant(
    "foodle-tap-003",
    "mock-tap-003",
    "TAP",
    {
      name: "后巷泰厨房",
      cuisines: ["泰国菜"],
      priceRange: "HK$101 至 200",
      openingState: "closed",
      openingLabel: "已休息，明日 11:30 营业",
    },
    {
      walkMinutes: 9,
      averageScore: 4.3,
      uniqueVisitors: 18,
      totalCheckins: 29,
    },
  ),
  mockRestaurant(
    "foodle-tap-004",
    "mock-tap-004",
    "TAP",
    {
      name: "铁路旁烘焙室",
      cuisines: null,
      priceRange: null,
      openingState: "unknown",
      openingLabel: null,
    },
    {
      walkMinutes: null,
      averageScore: null,
      uniqueVisitors: 3,
      totalCheckins: 5,
    },
  ),
  mockRestaurant(
    "foodle-kot-001",
    "mock-kot-001",
    "KOT",
    {
      name: "九龙塘拉面所",
      cuisines: ["日本菜", "拉面"],
      priceRange: "HK$51 至 100",
      openingState: "open",
      openingLabel: "营业中，22:00 关门",
    },
    {
      walkMinutes: 6,
      averageScore: 4.5,
      uniqueVisitors: 37,
      totalCheckins: 66,
    },
    { url: null },
  ),
  mockRestaurant(
    "foodle-kot-002",
    "mock-kot-002",
    "KOT",
    {
      name: "达之路冰室",
      cuisines: ["港式", "茶餐厅"],
      priceRange: "HK$50 以下",
      openingState: "open",
      openingLabel: "营业中，21:30 关门",
    },
    {
      walkMinutes: 5,
      averageScore: 4.1,
      uniqueVisitors: 24,
      totalCheckins: 39,
    },
  ),
  mockRestaurant(
    "foodle-kot-003",
    "mock-kot-003",
    "KOT",
    {
      name: "又一城咖喱屋",
      cuisines: ["东南亚菜", "咖喱"],
      priceRange: "HK$101 至 200",
      openingState: "closed",
      openingLabel: "已休息，明日 11:30 营业",
    },
    {
      walkMinutes: 8,
      averageScore: 4.3,
      uniqueVisitors: 19,
      totalCheckins: 28,
    },
  ),
  mockRestaurant(
    "foodle-jor-001",
    "mock-jor-001",
    "JOR",
    {
      name: "佐敦车仔面",
      cuisines: ["港式", "车仔面"],
      priceRange: "HK$50 以下",
      openingState: "open",
      openingLabel: "营业中，23:00 关门",
    },
    {
      walkMinutes: 4,
      averageScore: 4.4,
      uniqueVisitors: 43,
      totalCheckins: 71,
    },
  ),
  mockRestaurant(
    "foodle-jor-002",
    "mock-jor-002",
    "JOR",
    {
      name: "庙街小馆",
      cuisines: ["粤菜", "小菜"],
      priceRange: "HK$51 至 100",
      openingState: "unknown",
      openingLabel: null,
    },
    {
      walkMinutes: 7,
      averageScore: 4.0,
      uniqueVisitors: 16,
      totalCheckins: 23,
    },
  ),
];

export function getFoodleRestaurantsForStation(stationId: MtrStationId) {
  return FOODLE_RESTAURANTS.filter(
    (restaurant) => restaurant.foodle.stationId === stationId,
  );
}

export function hasFoodleRestaurants(stationId: MtrStationId) {
  return FOODLE_RESTAURANTS.some(
    (restaurant) => restaurant.foodle.stationId === stationId,
  );
}
