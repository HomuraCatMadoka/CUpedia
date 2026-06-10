// ==========================================================================
// LeaderboardItem — single ranked entry in the leaderboard list
// ==========================================================================

import { StarRating } from "./star-rating";
import type { Venue } from "@/lib/canteen-data";

const rankStyles: Record<
  string,
  { badge: string; bg: string; color: string }
> = {
  "1": { badge: "🥇", bg: "bg-amber-50", color: "text-amber-700" },
  "2": { badge: "🥈", bg: "bg-slate-50", color: "text-slate-600" },
  "3": { badge: "🥉", bg: "bg-orange-50", color: "text-orange-700" },
};

interface LeaderboardItemProps {
  venue: Venue;
  rank: number;
}

export function LeaderboardItem({ venue, rank }: LeaderboardItemProps) {
  const style = rankStyles[String(rank)];
  const isTop3 = rank <= 3 && !!style;

  return (
    <div className="flex items-center gap-3.5 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/20">
      {/* Rank number */}
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          isTop3
            ? `${style.bg} ${style.color}`
            : "bg-muted text-muted-foreground"
        }`}
      >
        {rank}
      </div>

      {/* Thumbnail */}
      <img
        src={`https://picsum.photos/seed/${venue.slug}/96/96`}
        alt={venue.name}
        className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
        loading="lazy"
      />

      {/* Name & Stars */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{venue.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <StarRating score={venue.rating} size="sm" />
          <span className="text-xs text-muted-foreground">
            {venue.rating.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Score & count */}
      <div className="flex-shrink-0 text-right">
        <div className="text-sm font-semibold">{venue.rating.toFixed(1)}</div>
        <div className="text-xs text-muted-foreground">
          {venue.reviewCount} 评价
        </div>
      </div>
    </div>
  );
}
