"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { Dish } from "@/lib/canteen-data";

interface DishCardProps {
  dish: Dish;
  isBubbleActive?: boolean;
  onBubblesOpen?: (cardRect: DOMRect) => void;
  children?: ReactNode;
}

export function DishCard({ dish, isBubbleActive, onBubblesOpen, children }: DishCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    if (onBubblesOpen && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      onBubblesOpen(rect);
    }
  };

  return (
    <div>
      <Card
        ref={cardRef}
        className={`group/dish cursor-pointer overflow-hidden transition-shadow hover:ring-foreground/20 ${
          isBubbleActive ? "ring-2 ring-neutral-400" : ""
        }`}
        onClick={handleClick}
      >
        {/* Image — click navigates to detail page */}
        <Link href={`/canteen/dish/${dish.slug}`} prefetch={false}>
          <img
            src={`https://picsum.photos/seed/${dish.imageSeed}/400/300`}
            alt={dish.name}
            className="aspect-[4/3] w-full object-cover"
            loading="lazy"
          />
        </Link>
        <CardContent>
          <div className="flex items-start justify-between gap-1">
            <Link
              href={`/canteen/dish/${dish.slug}`}
              prefetch={false}
              className="text-sm font-semibold leading-snug hover:underline"
            >
              {dish.name}
            </Link>
            <span className="shrink-0 text-sm font-medium text-muted-foreground">
              HKD {dish.price}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            {/* Like / Dislike counts */}
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-neutral-600">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 22V11M2 13v7a2 2 0 0 0 2 2h12.4a2 2 0 0 0 1.94-1.52l2.1-8.4A2 2 0 0 0 18.5 10H15V5a3 3 0 0 0-3-3l-1.4 1.4a4.25 4.25 0 0 0-1.17 2.35L8.5 11" />
                </svg>
                {dish.likeCount}
              </span>
              <span className="inline-flex items-center gap-1 text-neutral-400">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 2v11m5-2v-7a2 2 0 0 0-2-2H7.6a2 2 0 0 0-1.94 1.52l-2.1 8.4A2 2 0 0 0 5.5 14H9v5a3 3 0 0 0 3 3l1.4-1.4a4.25 4.25 0 0 0 1.17-2.35L15.5 13" />
                </svg>
                {dish.dislikeCount}
              </span>
            </div>
            {/* Detail link */}
            <Link
              href={`/canteen/dish/${dish.slug}`}
              prefetch={false}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground hover:underline"
            >
              详情 →
            </Link>
          </div>
        </CardContent>
      </Card>
      {children}
    </div>
  );
}
