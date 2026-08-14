import { NextResponse } from "next/server";

import { getCanteens } from "@/lib/canteen-actions";
import { getShameVoteCounts, getShameVoteCountsForDate } from "@/lib/canteen-shame-actions";
import { hktCalendarDate, rankShameCanteens } from "@/lib/canteen-shame-rank";
import { ERROR_CODES } from "@/lib/cli-api/errors";
import { fail, ok } from "@/lib/cli-api/respond";

export type ShitRankPeriod = "today" | "all";

type ShitRankEntry = {
  canteen: { id: string; name: string; location: string | null };
  votes: number;
};

/**
 * 💩堂榜: canteen dislike ranking for the CLI API.
 *
 * GET /api/canteens/shit-rank?period=today|all (default: today)
 * - today: votes cast on the current HKT calendar day
 * - all:   votes across all time
 * Rankings are ordered by votes descending (tie-break: canteen id ascending);
 * canteens with zero votes are still listed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPeriod = searchParams.get("period") ?? "today";
  if (rawPeriod !== "today" && rawPeriod !== "all") {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }
  const period: ShitRankPeriod = rawPeriod;

  const [canteens, counts] = await Promise.all([
    getCanteens(),
    period === "today"
      ? getShameVoteCountsForDate(hktCalendarDate())
      : getShameVoteCounts(),
  ]);

  const rankings: ShitRankEntry[] = rankShameCanteens(canteens, counts).map(
    ({ canteen, dislikes }) => ({
      canteen: { id: canteen.id, name: canteen.name, location: canteen.location },
      votes: dislikes,
    }),
  );

  return ok({ rankings, period });
}
