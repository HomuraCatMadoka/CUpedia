// ==========================================================================
// 寻味CU — Dish detail & rating page
// Route: /canteen/dish/[slug]
// ==========================================================================

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { StarRating } from "@/components/canteen/star-rating";
import { getDishBySlug, getVenueBySlug, getReviewsForDish } from "@/lib/canteen-data";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function DishRatingPage({ params }: PageProps) {
  const { slug } = await params;
  const dish = getDishBySlug(slug);

  if (!dish) {
    notFound();
  }

  const venue = getVenueBySlug(dish.venueSlug);
  const reviews = getReviewsForDish(slug);
  const isCanteen = venue?.type === "canteen";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-10">
        {/* ================================================================
            Dish Hero
            ================================================================ */}
        <div className="mb-8 text-center">
          <img
            src={`https://picsum.photos/seed/${dish.imageSeed}/840/630`}
            alt={dish.name}
            className="mx-auto mb-5 aspect-[4/3] w-full max-w-[420px] rounded-2xl object-cover shadow-lg"
          />
          <h1 className="text-[1.75rem] font-bold tracking-tight">
            {dish.name}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {venue ? (
              <Link
                href={`/canteen/${isCanteen ? "menu" : "delivery"}`}
                className="hover:text-foreground hover:underline"
              >
                {venue.name}
              </Link>
            ) : (
              "未知食堂"
            )}
            <span className="mx-2 text-border">·</span>
            <span>HKD {dish.price}</span>
          </p>
        </div>

        {/* ================================================================
            Description
            ================================================================ */}
        <Card className="mb-6">
          <CardContent>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              菜品介绍
            </h2>
            {dish.description ? (
              <p className="text-[0.9375rem] leading-relaxed">
                {dish.description}
              </p>
            ) : (
              <p className="text-[0.9375rem] italic text-muted-foreground">
                暂时还没有相关信息
              </p>
            )}
          </CardContent>
        </Card>

        {/* ================================================================
            Rating Summary
            ================================================================ */}
        <Card className="mb-8">
          <CardContent className="flex items-center gap-8 max-sm:flex-col max-sm:text-center">
            {/* Big score */}
            <div className="flex-shrink-0 text-center">
              <div className="text-[2.75rem] font-bold leading-none">
                {dish.rating.toFixed(1)}
              </div>
              <StarRating score={dish.rating} size="lg" className="mt-1.5" />
              <div className="mt-1 text-xs text-muted-foreground">
                {dish.reviewCount} 评价
              </div>
            </div>

            {/* Star distribution bars */}
            <div className="min-w-0 flex-1 space-y-0.5">
              {dish.ratingDistribution.map((pct, i) => {
                const stars = 5 - i;
                return (
                  <div key={stars} className="flex items-center gap-2">
                    <span className="w-5 flex-shrink-0 text-right text-xs text-muted-foreground">
                      {stars}★
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#e5c01b]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 flex-shrink-0 text-right text-xs text-muted-foreground/70">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ================================================================
            User Reviews
            ================================================================ */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">用户评价</h2>
            <span className="text-xs text-muted-foreground">
              共 {dish.reviewCount} 条
            </span>
          </div>

          <div className="space-y-3">
            {reviews.map((review, i) => (
              <Card key={i}>
                <CardContent className="flex items-start gap-3.5">
                  {/* Avatar */}
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      ["bg-amber-50 text-amber-600", "bg-blue-50 text-blue-600", "bg-green-50 text-green-600", "bg-purple-50 text-purple-600"][i % 4]
                    }`}
                  >
                    {review.initial}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {review.author}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {review.date}
                      </span>
                    </div>
                    <StarRating score={review.rating} size="sm" className="mt-1" />
                    <p className="mt-2 text-sm leading-relaxed">
                      {review.text}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Separator className="my-8" />

        {/* ================================================================
            Write Review Form (visual only — no interactivity)
            ================================================================ */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">撰写评价</h2>

          <p className="mb-2 text-xs text-muted-foreground">你的评分</p>
          <div className="mb-4 flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className="cursor-default select-none text-2xl text-[#e5c01b]"
              >
                ★
              </span>
            ))}
          </div>

          <Textarea
            className="mb-3 min-h-[100px] resize-y"
            placeholder="分享你的用餐体验…（需登录后提交，经过审核后发布）"
            disabled
          />

          <div className="flex items-center justify-between max-sm:flex-col max-sm:gap-3 max-sm:text-center">
            <span className="text-xs text-muted-foreground">
              登录后即可评价 · 提交后需经管理员审核
            </span>
            <Button disabled>提交评价</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
