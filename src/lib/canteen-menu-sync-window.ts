import type { HktWeekday, MealPeriod } from "@/db/schema";

const HKT_OFFSET_MS = 8 * 60 * 60 * 1_000;

const WINDOW_START_HOURS = {
  breakfast: 0,
  lunch: 11,
  dinner: 17,
} as const satisfies Record<MealPeriod, number>;

export type MenuSyncWindow = {
  key: string;
  period: MealPeriod;
  hktWeekday: HktWeekday;
  startsAt: Date;
  endsAt: Date;
};

function localBoundaryUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
): Date {
  return new Date(Date.UTC(year, month, day, hour) - HKT_OFFSET_MS);
}

/** Maps database time to the fixed Asia/Hong_Kong scheduling window. */
export function menuSyncWindowAt(databaseNow: Date): MenuSyncWindow {
  const hkt = new Date(databaseNow.getTime() + HKT_OFFSET_MS);
  const year = hkt.getUTCFullYear();
  const month = hkt.getUTCMonth();
  const day = hkt.getUTCDate();
  const hour = hkt.getUTCHours();
  const period: MealPeriod =
    hour >= WINDOW_START_HOURS.dinner
      ? "dinner"
      : hour >= WINDOW_START_HOURS.lunch
        ? "lunch"
        : "breakfast";

  const startHour = WINDOW_START_HOURS[period];
  const endHour =
    period === "breakfast"
      ? WINDOW_START_HOURS.lunch
      : period === "lunch"
        ? WINDOW_START_HOURS.dinner
        : 24;
  const date = `${year.toString().padStart(4, "0")}-${(month + 1)
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;

  return {
    key: `${date}/${period}`,
    period,
    // Date#getUTCDay is specified to return an integer in the 0-6 domain.
    hktWeekday: hkt.getUTCDay() as HktWeekday,
    startsAt: localBoundaryUtc(year, month, day, startHour),
    endsAt: localBoundaryUtc(year, month, day, endHour),
  };
}
