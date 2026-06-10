"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { dishReviews, type DishReview } from "@/lib/canteen-data";

interface CommentBubblesProps {
  dishId: string;
  cardRect: DOMRect;
  onClose: () => void;
}

function computeBubblePositions(count: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  if (count === 0) return positions;

  if (count <= 4) {
    const angles =
      count === 1 ? [-90] : count === 2 ? [-120, -60] : count === 3 ? [-135, -90, -45] : [-150, -90, -30, 60];
    for (const angle of angles) {
      const rad = (angle * Math.PI) / 180;
      positions.push({ x: Math.cos(rad) * (240 + Math.random() * 40), y: Math.sin(rad) * (180 + Math.random() * 30) });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const angle = -165 + (150 / (count - 1)) * i;
      const rad = (angle * Math.PI) / 180;
      positions.push({ x: Math.cos(rad) * (230 + (i % 3) * 30), y: Math.sin(rad) * (200 + (i % 2) * 40) });
    }
  }
  return positions;
}

export function CommentBubbles({ dishId, cardRect, onClose }: CommentBubblesProps) {
  const reviews: DishReview[] = dishReviews[dishId] ?? [];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  if (reviews.length === 0) {
    // No reviews: show a small toast instead of empty bubbles
    return createPortal(
      <div className="fixed inset-0 z-50" onClick={onClose}>
        <div className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm" />
        <div
          className="absolute rounded-xl border border-neutral-200 bg-white px-5 py-3 text-sm text-neutral-500 shadow-lg"
          style={{
            left: cardRect.left + cardRect.width / 2,
            top: cardRect.bottom + 10,
            transform: "translateX(-50%)",
          }}
        >
          该菜品暂时无评论，期待你的评论 OvO
        </div>
      </div>,
      document.body,
    );
  }

  const cx = cardRect.left + cardRect.width / 2;
  const cy = cardRect.top + cardRect.height / 2;
  const positions = computeBubblePositions(reviews.length);

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm" />
      <div className="pointer-events-none absolute inset-0">
        {reviews.map((review, i) => {
          const pos = positions[i];
          const isLike = review.type === "like";
          return (
            <div
              key={i}
              className={`absolute max-w-[230px] min-w-[140px] rounded-2xl px-4 py-2.5 shadow-lg ${
                isLike ? "border border-rose-200 bg-rose-50" : "border border-neutral-200 bg-neutral-50"
              }`}
              style={{
                left: cx + pos.x,
                top: cy + pos.y,
                animation: `bubblePop 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.08}s both`,
              }}
            >
              <div className="mb-0.5 text-[0.7rem] font-semibold">
                <span className={`mr-1 inline-block rounded-full px-1.5 py-px text-[0.6rem] font-semibold ${isLike ? "bg-rose-200 text-rose-700" : "bg-neutral-200 text-neutral-600"}`}>
                  {isLike ? "👍 赞" : "👎 踩"}
                </span>
                <span className={isLike ? "text-rose-700" : "text-neutral-600"}>{review.author}</span>
              </div>
              <p className="line-clamp-3 text-[0.8rem] leading-relaxed text-neutral-700">{review.text}</p>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
