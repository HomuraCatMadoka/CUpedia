import type { MealPeriod, MealPeriodAssignment } from "@/lib/canteen-types";

const PERIOD_WINDOWS: Array<{
  period: MealPeriod;
  start: number;
  end: number;
}> = [
  { period: "breakfast", start: 0, end: 11 * 60 },
  { period: "lunch", start: 11 * 60, end: 17 * 60 },
  { period: "dinner", start: 17 * 60, end: 24 * 60 },
];

function minutes(value: string | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, mins] = value.split(":").map(Number);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

export function mealPeriodsForOperatingWindow(
  startTime: string | undefined,
  endTime: string | undefined,
): MealPeriodAssignment[] {
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (start === null || end === null || end <= start) return ["allday"];
  const periods = PERIOD_WINDOWS.filter(
    (window) => start < window.end && end > window.start,
  ).map((window) => window.period);
  return periods.length > 0 ? periods : ["allday"];
}
