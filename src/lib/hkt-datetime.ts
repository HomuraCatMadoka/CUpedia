const HKT = "Asia/Hong_Kong";

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
