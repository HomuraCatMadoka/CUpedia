"use client";

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Dish } from "@/lib/canteen-data";
import { dishReviews } from "@/lib/canteen-data";
import { DishCard } from "./dish-card";
import { CommentBubbles } from "./comment-bubbles";
import { InlineReviewForm } from "./inline-review-form";

interface DishCardWithReviewProps {
  dish: Dish;
}

function WriteReviewButton({ left, top, onClick }: { left: number; top: number; onClick: () => void }) {
  return createPortal(
    <div className="fixed z-[51]" style={{ left, top, transform: "translateX(-50%)" }}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
        写评论
      </button>
    </div>,
    document.body,
  );
}

function ReviewFormPortal({
  left,
  top,
  dishName,
  onClose,
  onSubmit,
}: {
  left: number;
  top: number;
  dishName: string;
  onClose: () => void;
  onSubmit: (review: { type: "like" | "dislike"; text: string; author: string }) => void;
}) {
  return createPortal(
    <div className="fixed z-[60]" style={{ left, top, transform: "translateX(-50%)", width: "320px" }}>
      <InlineReviewForm dishName={dishName} onClose={onClose} onSubmit={onSubmit} />
    </div>,
    document.body,
  );
}

export function DishCardWithReview({ dish }: DishCardWithReviewProps) {
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const [, setVersion] = useState(0);

  const openBubbles = useCallback((rect: DOMRect) => {
    setCardRect(rect);
    setBubbleOpen(true);
    setReviewOpen(false);
  }, []);

  const closeBubbles = useCallback(() => {
    setBubbleOpen(false);
    setCardRect(null);
  }, []);

  const openReview = useCallback(() => {
    setBubbleOpen(false);
    setReviewOpen(true);
  }, []);

  const closeReview = useCallback(() => setReviewOpen(false), []);

  const submitReview = useCallback(
    (review: { type: "like" | "dislike"; text: string; author: string }) => {
      if (!dishReviews[dish.slug]) dishReviews[dish.slug] = [];
      dishReviews[dish.slug].push(review);
      setReviewOpen(false);
      setVersion((v) => v + 1);
    },
    [dish.slug],
  );

  const btnLeft = cardRect ? cardRect.left + cardRect.width / 2 : 0;
  const btnTop = cardRect ? cardRect.bottom + 8 : 0;

  return (
    <>
      <div>
        <DishCard dish={dish} isBubbleActive={bubbleOpen} onBubblesOpen={openBubbles} />

      {/* Review form — portaled above bubbles at z-[60] */}
      {reviewOpen && cardRect && (
        <ReviewFormPortal
          left={cardRect.left + cardRect.width / 2}
          top={cardRect.bottom + 8}
          dishName={dish.name}
          onClose={closeReview}
          onSubmit={submitReview}
        />
      )}
      </div>

      {/* Bubbles overlay (z-50) + Write button (z-[51]) */}
      {bubbleOpen && cardRect && (
        <>
          <CommentBubbles dishId={dish.slug} cardRect={cardRect} onClose={closeBubbles} />
          <WriteReviewButton left={btnLeft} top={btnTop} onClick={openReview} />
        </>
      )}
    </>
  );
}
