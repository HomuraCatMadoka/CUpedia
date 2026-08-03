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
import { isPgPermissionDenied } from "@/lib/pg-errors";

export const dynamic = "force-dynamic";

export default async function CanteenShitRankPage() {
  const voteDate = hktCalendarDate();
  const previousVoteDate = previousCalendarDate(voteDate);

  let canteens;
  let todayCounts;
  let previousCounts;
  let allTimeCounts;
  let votingEndDate: string;

  try {
    [canteens, todayCounts, previousCounts, allTimeCounts, votingEndDate] =
      await Promise.all([
        getCanteens(),
        getShameVoteCountsForDate(voteDate),
        getShameVoteCountsForDate(previousVoteDate),
        getShameVoteCounts(),
        getCanteenShameVoteEndDate(),
      ]);
  } catch (error) {
    if (!isPgPermissionDenied(error)) throw error;
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
          <section className="rounded-2xl border border-[#e3e5e7] bg-white px-4 py-10 text-center shadow-[0_2px_8px_rgba(32,33,36,0.06)] sm:px-6">
            <h1 className="text-2xl font-semibold tracking-tight">💩堂榜</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#74777c]">
              当前数据库账号没有{" "}
              <code className="text-[#623d2a]">canteen_shame_votes</code>{" "}
              的读取权限，榜单暂时无法加载。请给只读账号补
              <code className="text-[#623d2a]"> GRANT SELECT </code>
              后再试。
            </p>
          </section>
        </div>
      </main>
    );
  }

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
          key={voteDate}
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
