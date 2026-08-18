const HKT = "Asia/Hong_Kong";
const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Current calendar month in Asia/Hong_Kong as `YYYY-MM`. */
export function currentMonthHkt(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HKT,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** UTC instant at the start of an inclusive HKT calendar-day window. */
export function startOfHktCalendarWindow(now: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("days must be a positive integer");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HKT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return new Date(Date.UTC(year, month - 1, day - (days - 1)) - HKT_OFFSET_MS);
}
