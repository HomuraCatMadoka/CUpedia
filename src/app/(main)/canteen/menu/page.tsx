// ==========================================================================
// 寻味CU — 食堂菜单 page
// Route: /canteen/menu
// Two-column layout: canteen sidebar + dish grid
// ==========================================================================

import { Input } from "@/components/ui/input";
import { VenueHeader } from "@/components/canteen/venue-header";
import { DishCardWithReview } from "@/components/canteen/dish-card-with-review";
import { AddDishCard } from "@/components/canteen/add-dish-card";
import { canteens, shawDishes } from "@/lib/canteen-data";

const activeCanteen = canteens[0]; // 善衡书院 (default)

export default function CanteenMenuPage() {
  return (
    <>
      {/* Sidebar */}
      <aside className="flex w-[var(--sidebar-width)] flex-shrink-0 flex-col overflow-y-auto border-r border-border bg-[var(--sidebar-bg)] max-md:hidden">
        <div className="px-4 pb-3 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          食堂列表
        </div>
        <nav className="pb-4">
          {canteens.map((c) => (
            <div
              key={c.slug}
              className={`flex cursor-default items-center px-4 py-2 text-sm transition-colors hover:bg-[var(--sidebar-active-bg)] ${
                c.slug === activeCanteen.slug
                  ? "border-l-[3px] border-l-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] font-medium"
                  : "border-l-[3px] border-l-transparent"
              }`}
            >
              {c.name}
              <span className="ml-auto text-xs text-muted-foreground/60">
                {c.dishCount}
              </span>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8 max-md:px-4 max-md:py-4">
        {/* Venue Header */}
        <VenueHeader venue={activeCanteen} />

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
            共 {shawDishes.length} 道菜品
          </span>
        </div>

        {/* Dish Grid — responsive 4→3→2→1 columns */}
        <div className="grid grid-cols-4 gap-4 xl:grid-cols-4 max-xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {shawDishes.map((dish) => (
            <DishCardWithReview key={dish.slug} dish={dish} />
          ))}
          <AddDishCard />
        </div>
      </div>
    </>
  );
}
