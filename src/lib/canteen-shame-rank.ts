import type { Canteen } from "@/lib/canteen-types";

const HKT = "Asia/Hong_Kong";

export const CANTEEN_SHAME_COUNTS_TAG = "canteen-shame-counts";

export type ShameRankEntry = {
  canteen: Canteen;
  dislikes: number;
};

/** Asia/Hong_Kong wall-calendar date as YYYY-MM-DD. */
export function hktCalendarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HKT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** 💩堂榜：当日踩数降序；同分按食堂 id 升序；零票食堂仍展示。 */
export function rankShameCanteens(
  canteens: Canteen[],
  dislikeCounts: Record<string, number>,
): ShameRankEntry[] {
  return canteens
    .map((canteen) => ({
      canteen,
      dislikes: dislikeCounts[canteen.id] ?? 0,
    }))
    .sort((a, b) => {
      if (b.dislikes !== a.dislikes) return b.dislikes - a.dislikes;
      return a.canteen.id.localeCompare(b.canteen.id);
    });
}
