// ==========================================================================
// 寻味CU — 外卖菜单 page
// Route: /canteen/delivery
// Same layout as menu/page.tsx but with delivery merchants
// ==========================================================================

import { Input } from "@/components/ui/input";
import { VenueHeader } from "@/components/canteen/venue-header";
import { DishCardWithReview } from "@/components/canteen/dish-card-with-review";
import { AddDishCard } from "@/components/canteen/add-dish-card";
import { deliveryMerchants, mcdonaldsDishes } from "@/lib/canteen-data";

const activeMerchant = deliveryMerchants[0]; // 麦当劳 (default)

export default function DeliveryMenuPage() {
  return (
    <>
      {/* Sidebar */}
      <aside className="flex w-[var(--sidebar-width)] flex-shrink-0 flex-col overflow-y-auto border-r border-border bg-[var(--sidebar-bg)] max-md:hidden">
        <div className="px-4 pb-3 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          外卖商家
        </div>
        <nav className="pb-4">
          {deliveryMerchants.map((m) => (
            <div
              key={m.slug}
              className={`flex cursor-default items-center px-4 py-2 text-sm transition-colors hover:bg-[var(--sidebar-active-bg)] ${
                m.slug === activeMerchant.slug
                  ? "border-l-[3px] border-l-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] font-medium"
                  : "border-l-[3px] border-l-transparent"
              }`}
            >
              {m.name}
              <span className="ml-auto text-xs text-muted-foreground/60">
                {m.dishCount}
              </span>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8 max-md:px-4 max-md:py-4">
        {/* Venue Header */}
        <VenueHeader venue={activeMerchant} />

        {/* Search + Dish count */}
        <div className="mb-5 flex items-center justify-between">
          <div className="relative w-[260px]">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="搜索菜品…"
              disabled
            />
          </div>
          <span className="text-xs text-muted-foreground">
            共 {mcdonaldsDishes.length} 道菜品
          </span>
        </div>

        {/* Dish Grid */}
        <div className="grid grid-cols-4 gap-4 xl:grid-cols-4 max-xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {mcdonaldsDishes.map((dish) => (
            <DishCardWithReview key={dish.slug} dish={dish} />
          ))}
          <AddDishCard />
        </div>
      </div>
    </>
  );
}
