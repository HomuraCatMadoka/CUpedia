import { getCanteens } from "@/lib/canteen-actions";
import { getTodayShameVoteCounts } from "@/lib/canteen-shame-actions";
import { hktCalendarDate } from "@/lib/canteen-shame-rank";
import { CanteenShell } from "@/components/canteen/canteen-shell";
import { ShameRankList } from "@/components/canteen/shame-rank-list";

export const dynamic = "force-dynamic";

export default async function CanteenShitRankPage() {
  const [canteens, counts] = await Promise.all([
    getCanteens(),
    getTodayShameVoteCounts(),
  ]);
  const voteDate = hktCalendarDate();

  return (
    <CanteenShell
      backHref="/canteen"
      backLabel="返回山城食记"
      title="每日💩堂榜"
      subtitle="今日踩数最高排第一 · 每日按港时刷新展示"
    >
      <ShameRankList
        canteens={canteens}
        initialCounts={counts}
        voteDate={voteDate}
      />
    </CanteenShell>
  );
}
