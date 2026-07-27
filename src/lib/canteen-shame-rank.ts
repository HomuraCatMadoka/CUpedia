import type { Canteen } from "@/lib/canteen-types";

const HKT = "Asia/Hong_Kong";

/** Anonymous stomps per HKT calendar day (cookie session). Overridable for tests. */
export function getAnonShameDailyLimit(): number {
  const raw = process.env.CANTEEN_SHAME_ANON_DAILY_LIMIT;
  const n = raw ? Number(raw) : 50;
  const limit = Math.floor(n);
  return Number.isFinite(n) && limit >= 1 ? Math.min(50, limit) : 50;
}

/** End date is inclusive; both values are validated YYYY-MM-DD strings. */
export function isShameVotingOpen(
  voteDate: string,
  votingEndDate: string,
): boolean {
  return voteDate <= votingEndDate;
}

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

export function previousCalendarDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);
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
