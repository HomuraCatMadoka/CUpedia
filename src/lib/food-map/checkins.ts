export const FOOD_MAP_CHECKINS_STORAGE_KEY = "cupedia:food-map-checkins:v1";

const STORE_VERSION = 1 as const;
const HKT = "Asia/Hong_Kong";
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type FoodMapCheckinStore = {
  version: typeof STORE_VERSION;
  byDate: Record<string, string[]>;
};

export function emptyFoodMapCheckinStore(): FoodMapCheckinStore {
  return { version: STORE_VERSION, byDate: {} };
}

/** Asia/Hong_Kong wall-calendar date as YYYY-MM-DD. */
export function hktDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HKT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") =>
    parts.find((item) => item.type === type)?.value;

  return `${part("year") ?? "1970"}-${part("month") ?? "01"}-${part("day") ?? "01"}`;
}

function normalizeFoodMapCheckinStore(input: unknown): FoodMapCheckinStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return emptyFoodMapCheckinStore();
  }

  const candidate = input as Record<string, unknown>;
  if (
    candidate.version !== STORE_VERSION ||
    !candidate.byDate ||
    typeof candidate.byDate !== "object" ||
    Array.isArray(candidate.byDate)
  ) {
    return emptyFoodMapCheckinStore();
  }

  const byDate: Record<string, string[]> = {};
  for (const [date, value] of Object.entries(candidate.byDate)) {
    if (!DATE_KEY.test(date) || !Array.isArray(value)) continue;

    const restaurantIds = [
      ...new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
    if (restaurantIds.length > 0) byDate[date] = restaurantIds;
  }

  return { version: STORE_VERSION, byDate };
}

export function parseFoodMapCheckinStore(
  raw: string | null | undefined,
): FoodMapCheckinStore {
  if (!raw) return emptyFoodMapCheckinStore();

  try {
    return normalizeFoodMapCheckinStore(JSON.parse(raw));
  } catch {
    return emptyFoodMapCheckinStore();
  }
}

export function serializeFoodMapCheckinStore(
  store: FoodMapCheckinStore,
): string {
  return JSON.stringify(normalizeFoodMapCheckinStore(store));
}

export function toggleFoodMapCheckin(
  store: FoodMapCheckinStore,
  date: string,
  restaurantId: string,
): FoodMapCheckinStore {
  const current = normalizeFoodMapCheckinStore(store);
  const id = restaurantId.trim();
  if (!DATE_KEY.test(date) || !id) return current;

  const checked = current.byDate[date] ?? [];
  const nextForDate = checked.includes(id)
    ? checked.filter((candidate) => candidate !== id)
    : [...checked, id];
  const byDate = { ...current.byDate };

  if (nextForDate.length > 0) byDate[date] = nextForDate;
  else delete byDate[date];

  return { version: STORE_VERSION, byDate };
}

export function recordFoodMapCheckin(
  store: FoodMapCheckinStore,
  date: string,
  restaurantId: string,
): FoodMapCheckinStore {
  const current = normalizeFoodMapCheckinStore(store);
  const id = restaurantId.trim();
  if (!DATE_KEY.test(date) || !id) return current;

  const checked = current.byDate[date] ?? [];
  if (checked.includes(id)) return current;

  return {
    version: STORE_VERSION,
    byDate: { ...current.byDate, [date]: [...checked, id] },
  };
}

export function countFoodMapVisits(
  store: FoodMapCheckinStore,
  restaurantId: string,
) {
  const current = normalizeFoodMapCheckinStore(store);
  return Object.values(current.byDate).filter((ids) =>
    ids.includes(restaurantId),
  ).length;
}
