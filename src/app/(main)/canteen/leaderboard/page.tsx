// ==========================================================================
// 寻味CU — 排行榜 page
// Route: /canteen/leaderboard
// ==========================================================================

import { Badge } from "@/components/ui/badge";
import { LeaderboardItem } from "@/components/canteen/leaderboard-item";
import { allVenuesByRating } from "@/lib/canteen-data";

export default function LeaderboardPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-10">
        {/* Page Title */}
        <h1 className="text-2xl font-bold tracking-tight">排行榜</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          食堂与菜品热门排行，数据实时更新
        </p>

        {/* Toggle Section */}
        <div className="mt-8 flex flex-col items-center gap-4">
          {/* Main toggle: 食堂排行 / 菜品排行 */}
          <div className="inline-flex rounded-[0.625rem] bg-[#f4f4f1] p-0.5 gap-0.5">
            <span className="cursor-default select-none rounded-md bg-white px-5 py-1.5 text-sm font-medium text-foreground shadow-sm">
              食堂排行
            </span>
            <span className="cursor-default select-none rounded-md px-5 py-1.5 text-sm font-medium text-muted-foreground">
              菜品排行
            </span>
          </div>

          {/* Time filter */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="cursor-default select-none rounded-full px-3.5 py-1 text-xs">
              1 个月
            </Badge>
            <Badge variant="outline" className="cursor-default select-none rounded-full px-3.5 py-1 text-xs">
              3 个月
            </Badge>
            <Badge className="cursor-default select-none rounded-full px-3.5 py-1 text-xs">
              全部
            </Badge>
          </div>
        </div>

        {/* Ranked List */}
        <div className="mt-8 flex flex-col gap-2">
          {allVenuesByRating.slice(0, 10).map((venue, i) => (
            <LeaderboardItem key={venue.slug} venue={venue} rank={i + 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
