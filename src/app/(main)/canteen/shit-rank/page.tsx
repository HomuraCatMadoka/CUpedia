import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCanteens } from "@/lib/canteen-actions";
import {
  getShameVoteCounts,
  getShameVoteCountsForDate,
} from "@/lib/canteen-shame-actions";
import {
  hktCalendarDate,
  isShameVotingOpen,
  previousCalendarDate,
} from "@/lib/canteen-shame-rank";
import { getCanteenShameVoteEndDate } from "@/lib/site-settings";
import { ShameRankList } from "@/components/canteen/shame-rank-list";

export const dynamic = "force-dynamic";

export default async function CanteenShitRankPage() {
  const voteDate = hktCalendarDate();
  const previousVoteDate = previousCalendarDate(voteDate);
  const [canteens, todayCounts, previousCounts, allTimeCounts, votingEndDate] =
    await Promise.all([
      getCanteens(),
      getShameVoteCountsForDate(voteDate),
      getShameVoteCountsForDate(previousVoteDate),
      getShameVoteCounts(),
      getCanteenShameVoteEndDate(),
    ]);

  return (
    <main className="min-h-[calc(100dvh-var(--navbar-height))] bg-[#f6f7f8] px-4 py-6 text-[#202124] sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/canteen"
          className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-[#74777c] transition-colors hover:bg-[#f7ece5] hover:text-[#623d2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a452d]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          返回食堂
        </Link>
        <ShameRankList
          canteens={canteens}
          initialTodayCounts={todayCounts}
          initialAllTimeCounts={allTimeCounts}
          previousCounts={previousCounts}
          voteDate={voteDate}
          votingEndDate={votingEndDate}
          votingOpen={isShameVotingOpen(voteDate, votingEndDate)}
        />
      </div>
    </main>
  );
}
