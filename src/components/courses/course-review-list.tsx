"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThumbsDownIcon, ThumbsUpIcon, UserCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type CourseReviewListItem = {
  id: string;
  rating: number;
  difficulty: number;
  workload: number;
  grading: number;
  content: string;
  term: string | null;
  instructor: string | null;
  anonymous: boolean;
  helpfulScore: number;
  createdAt: string;
  user: { id: string; nickname: string } | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-HK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}/5</span>
    </span>
  );
}

export function CourseReviewList({
  reviews,
  isAuthenticated,
}: {
  reviews: CourseReviewListItem[];
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function vote(reviewId: string, value: 1 | -1) {
    setBusyId(reviewId);
    startTransition(async () => {
      try {
        await fetch(`/api/reviews/${reviewId}/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        });
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Reviews</h2>
        <span className="text-sm text-muted-foreground">
          {reviews.length} total
        </span>
      </div>

      {!isAuthenticated && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground underline">
            Log in
          </Link>{" "}
          to vote on reviews.
        </div>
      )}

      <div className="space-y-3">
        {reviews.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No reviews yet.
          </div>
        ) : (
          reviews.map((review) => (
            <article key={review.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <UserCircleIcon className="size-4 text-muted-foreground" />
                    <span className="font-medium">
                      {review.user?.nickname ?? "Anonymous student"}
                    </span>
                    {review.anonymous && (
                      <Badge variant="secondary">Anonymous</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(review.createdAt)}</span>
                    {review.term && <span>{review.term}</span>}
                    {review.instructor && <span>{review.instructor}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">
                    {review.rating}
                    <span className="text-xs font-normal text-muted-foreground">
                      /5
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Overall</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Metric label="Difficulty" value={review.difficulty} />
                <Metric label="Workload" value={review.workload} />
                <Metric label="Grading" value={review.grading} />
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
                {review.content}
              </p>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!isAuthenticated || (pending && busyId === review.id)}
                  onClick={() => vote(review.id, 1)}
                >
                  <ThumbsUpIcon className="size-3.5" />
                  {review.helpfulScore}
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={!isAuthenticated || (pending && busyId === review.id)}
                  onClick={() => vote(review.id, -1)}
                  aria-label="Mark as not helpful"
                >
                  <ThumbsDownIcon className="size-3.5" />
                </Button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
