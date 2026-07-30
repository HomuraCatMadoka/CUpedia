"use client";

import type {
  CanteenMenuItem,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import { X } from "lucide-react";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import { DishVoteButtons } from "@/components/canteen/dish-vote-buttons";
import { MealPeriodsBadges } from "@/components/canteen/meal-period-badge";
import { MenuItemCommentPanel } from "@/components/canteen/menu-item-comment-panel";
import { MenuItemPrice } from "@/components/canteen/menu-item-price";
import { useDishVote } from "@/components/canteen/use-dish-vote";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CanteenDishDetailsDialog({
  item,
  open,
  counts,
  myVote,
  onVoteChange,
  currentUserId,
  commentBlocked,
  initialCommentCount,
  onCommentCountChange,
  onOpenChange,
  onAfterClose,
}: {
  item: CanteenMenuItem | null;
  open: boolean;
  counts: MenuItemVoteCounts;
  myVote: VoteChoice;
  onVoteChange: (
    itemId: string,
    prevVote: VoteChoice,
    nextVote: VoteChoice,
  ) => void;
  currentUserId: string | null;
  commentBlocked: "banned" | null;
  initialCommentCount: number;
  onCommentCountChange: (count: number) => void;
  onOpenChange: (open: boolean) => void;
  onAfterClose: () => void;
}) {
  const { error, pending, handleVote } = useDishVote(
    item?.id ?? "",
    myVote,
    onVoteChange,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onAfterClose();
      }}
    >
      {item ? (
        <DialogContent
          showCloseButton={false}
          overlayClassName="canteen-dialog-overlay"
          className="canteen-zone canteen-dish-dialog fixed top-auto bottom-0 left-0 grid max-h-[min(88dvh,46rem)] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-t-2xl rounded-b-none p-0 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <DialogClose
            aria-label="关闭菜品详情"
            className="canteen-dish-close absolute top-3 right-3 z-10"
          >
            <X className="size-[1.125rem]" aria-hidden />
          </DialogClose>
          <DialogHeader className="border-b border-[var(--canteen-line)] px-4 pt-4 pr-14 pb-3.5 text-left">
            <div className="flex items-start gap-3">
              <DishSvgIcon
                svgKey={item.svgKey}
                className="canteen-menu-icon size-10 shrink-0 rounded-xl"
              />
              <div className="min-w-0">
                <DialogTitle className="canteen-display text-lg leading-6 font-semibold text-pretty">
                  {item.name}
                </DialogTitle>
                <MealPeriodsBadges
                  periods={item.mealPeriods}
                  className="mt-1"
                />
                <MenuItemPrice
                  pricing={item.pricing}
                  variant="summary"
                  empty={null}
                  className="canteen-dish-price-summary mt-1.5 block font-semibold text-[var(--canteen-ink)]"
                />
              </div>
            </div>
            <DialogDescription className="sr-only">
              查看菜品价格选项和评论
            </DialogDescription>
          </DialogHeader>

          <div className="overscroll-contain overflow-y-auto px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <section aria-labelledby="canteen-dish-price-heading">
              <h3
                id="canteen-dish-price-heading"
                className="text-[0.8125rem] font-semibold text-[var(--canteen-ink)]"
              >
                价格与搭配
              </h3>
              <MenuItemPrice
                pricing={item.pricing}
                variant="list"
                listCollapsedAfter={4}
                className="canteen-dish-price-list mt-2"
              />
            </section>

            <section
              aria-labelledby="canteen-dish-reputation-heading"
              className="canteen-dish-section"
            >
              <h3
                id="canteen-dish-reputation-heading"
                className="text-[0.8125rem] font-semibold text-[var(--canteen-ink)]"
              >
                大家怎么评
              </h3>
              <DishVoteButtons
                counts={counts}
                myVote={myVote}
                pending={pending}
                onVote={handleVote}
                className="canteen-dish-votes mt-2 justify-start"
              />
              {error ? (
                <p className="mt-1 text-xs text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
            </section>

            <section className="canteen-dish-section">
              <MenuItemCommentPanel
                key={item.id}
                menuItemId={item.id}
                currentUserId={currentUserId}
                commentBlocked={commentBlocked}
                initialCommentCount={initialCommentCount}
                onCountChange={onCommentCountChange}
              />
            </section>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
