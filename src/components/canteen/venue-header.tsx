// ==========================================================================
// VenueHeader — card showing venue info above the dish grid
// Shared by canteen-menu and delivery-menu pages
// ==========================================================================

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "./star-rating";
import type { Venue } from "@/lib/canteen-data";

interface VenueHeaderProps {
  venue: Venue;
}

export function VenueHeader({ venue }: VenueHeaderProps) {
  const isDelivery = venue.type === "delivery";

  return (
    <Card className="mb-6 p-2">
      <CardContent className="flex items-start gap-4">
        {/* Venue icon */}
        <div
          className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl text-2xl ${
            isDelivery ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
          }`}
        >
          {isDelivery ? "🛵" : "🏛️"}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">{venue.name}</h1>

          {/* Delivery tags */}
          {venue.tags && venue.tags.length > 0 && (
            <div className="mt-1 flex gap-2">
              {venue.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-[0.65rem]"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Rating */}
          <div className="mt-1.5 flex items-center gap-2">
            <StarRating score={venue.rating} size="md" />
            <span className="text-sm font-semibold">
              {venue.rating.toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground">
              ({venue.reviewCount} 评价)
            </span>
          </div>

          {/* Recommended dishes */}
          {venue.recommendedDishes.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium">👍 推荐菜品</span>
              {venue.recommendedDishes.map((dish) => (
                <Badge key={dish} variant="outline" className="text-[0.7rem]">
                  {dish}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Rate button */}
        <div className="flex-shrink-0">
          <Button variant="outline" size="sm" className="gap-1">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="#e5c01b"
              stroke="none"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            评价{isDelivery ? "商家" : "食堂"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
