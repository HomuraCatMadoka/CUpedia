import type {
  CanteenMenuItem,
  MealPeriod,
  MenuItemVoteCounts,
} from "@/lib/canteen-types";

export type RankedDish = {
  item: CanteenMenuItem;
  counts: MenuItemVoteCounts;
};

export function filterItemsByMealPeriod(
  items: CanteenMenuItem[],
  period: MealPeriod,
): CanteenMenuItem[] {
  return items.filter((item) => item.mealPeriod === period);
}

function countsFor(
  itemId: string,
  voteCounts: Record<string, MenuItemVoteCounts>,
): MenuItemVoteCounts {
  return voteCounts[itemId] ?? { likes: 0, dislikes: 0 };
}

/** 大众推荐：likes DESC，同分按 likes − dislikes DESC。 */
export function rankRecommendDishes(
  items: CanteenMenuItem[],
  voteCounts: Record<string, MenuItemVoteCounts>,
): RankedDish[] {
  return items
    .map((item) => ({
      item,
      counts: countsFor(item.id, voteCounts),
    }))
    .sort((a, b) => {
      if (b.counts.likes !== a.counts.likes) {
        return b.counts.likes - a.counts.likes;
      }
      const netA = a.counts.likes - a.counts.dislikes;
      const netB = b.counts.likes - b.counts.dislikes;
      return netB - netA;
    });
}

/** 大众避雷：dislikes DESC，同分按 dislikes − likes DESC。 */
export function rankAvoidDishes(
  items: CanteenMenuItem[],
  voteCounts: Record<string, MenuItemVoteCounts>,
): RankedDish[] {
  return items
    .map((item) => ({
      item,
      counts: countsFor(item.id, voteCounts),
    }))
    .sort((a, b) => {
      if (b.counts.dislikes !== a.counts.dislikes) {
        return b.counts.dislikes - a.counts.dislikes;
      }
      const gapA = a.counts.dislikes - a.counts.likes;
      const gapB = b.counts.dislikes - b.counts.likes;
      return gapB - gapA;
    });
}
