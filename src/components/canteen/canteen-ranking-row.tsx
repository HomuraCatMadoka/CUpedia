import type { RankedDish } from "@/lib/canteen-rankings";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import { MenuItemCommentPanel } from "@/components/canteen/menu-item-comment-panel";
import { MenuItemPrice } from "@/components/canteen/menu-item-price";
import { cn } from "@/lib/utils";

export function CanteenRankingRow({
  rank,
  entry,
  emphasis,
  currentUserId = null,
  commentBlocked = null,
  initialCommentCount = 0,
}: {
  rank: number;
  entry: RankedDish;
  emphasis: "recommend" | "avoid";
  currentUserId?: string | null;
  commentBlocked?: "banned" | null;
  initialCommentCount?: number;
}) {
  const { item, counts } = entry;
  const primary = emphasis === "recommend" ? counts.likes : counts.dislikes;
  const secondary = emphasis === "recommend" ? counts.dislikes : counts.likes;
  const primaryLabel = emphasis === "recommend" ? "赞" : "踩";
  const secondaryLabel = emphasis === "recommend" ? "踩" : "赞";

  return (
    <li className="canteen-ledger-row flex flex-wrap items-center gap-3 px-1 py-3 sm:flex-nowrap sm:gap-4">
      <span
        className={cn(
          "canteen-display flex size-8 shrink-0 items-center justify-center font-mono text-sm font-semibold tabular-nums",
          rank === 1
            ? "text-[var(--canteen-purple)]"
            : "text-[var(--canteen-muted)]",
        )}
        aria-hidden
      >
        {String(rank).padStart(2, "0")}
      </span>
      <DishSvgIcon svgKey={item.svgKey} className="size-10 rounded-md" />
      <div className="min-w-0 flex-1 basis-[calc(100%-7rem)] sm:basis-auto">
        <p className="font-medium text-[var(--canteen-ink)]">{item.name}</p>
        <p className="mt-0.5 text-xs text-[var(--canteen-muted)]">
          {primaryLabel} {primary} · {secondaryLabel} {secondary}
        </p>
        <MenuItemCommentPanel
          menuItemId={item.id}
          currentUserId={currentUserId}
          commentBlocked={commentBlocked}
          initialCommentCount={initialCommentCount}
        />
      </div>
      <MenuItemPrice
        pricing={item.pricing}
        className="w-full justify-start font-mono text-sm tabular-nums text-[var(--canteen-ink)] sm:w-auto sm:max-w-52 sm:shrink-0 sm:justify-end"
      />
    </li>
  );
}
