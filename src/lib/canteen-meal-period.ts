import type { MealPeriod } from "@/db/schema";

const HKT = "Asia/Hong_Kong";

const BREAKFAST_END = 11 * 60 + 30; // 11:30
const AFTERNOON_HINT_START = 14 * 60 + 30; // 14:30
const DINNER_START = 17 * 60 + 30; // 17:30

function minutesSinceMidnightHkt(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HKT,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** Default meal-period tab for Asia/Hong_Kong wall clock. */
export function defaultMealPeriodForHkt(now: Date): MealPeriod {
  const mins = minutesSinceMidnightHkt(now);
  if (mins < BREAKFAST_END) return "breakfast";
  if (mins < DINNER_START) return "lunch";
  return "dinner";
}

/** 14:30–17:29 HKT: lunch tab still default, show afternoon hint. */
export function shouldShowAfternoonHint(now: Date): boolean {
  const mins = minutesSinceMidnightHkt(now);
  return mins >= AFTERNOON_HINT_START && mins < DINNER_START;
}

export const AFTERNOON_HINT_TEXT =
  "午餐高峰已过，晚餐 17:30 起";
