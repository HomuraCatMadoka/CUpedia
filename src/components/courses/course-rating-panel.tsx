"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  submitCourseRating,
  type CourseRatingState,
} from "@/lib/course-review-actions";

const QUICK_SCORES = [6, 7, 8, 9, 10] as const;

export function CourseRatingPanel({
  code,
  state,
  isAuthenticated,
}: {
  code: string;
  state: CourseRatingState;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [score, setScore] = useState(state.lastScore ?? 8);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const canSubmit = isAuthenticated && !pending;

  function handleSubmit() {
    setError("");
    startTransition(async () => {
      try {
        await submitCourseRating(code, score);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "提交失败");
      }
    });
  }

  return (
    <section className="rounded-2xl border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">给这门课打分</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.ratingCount > 0
              ? `已有 ${state.ratingCount} 次评分，综合 ${state.aggregateRating?.toFixed(1) ?? "—"} 分`
              : "暂无用户评分，提交后将更新综合推荐指数"}
          </p>
          {state.lastScore != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              你的评分：{state.lastScore.toFixed(1)} 分（可更新）
            </p>
          )}
        </div>
        <div className="rounded-xl bg-secondary/60 px-5 py-3 text-center">
          <p className="text-xs text-muted-foreground">你选择的分数</p>
          <p className="text-3xl font-light tracking-tighter tabular-nums">
            {score.toFixed(1)}
          </p>
        </div>
      </div>

      {!isAuthenticated ? (
        <div className="mt-6 rounded-xl border bg-secondary/40 p-4 text-sm text-muted-foreground">
          请先{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            登录
          </Link>{" "}
          后为课程打分。
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {/* Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span className="font-medium text-foreground">
                拖动选择 0–10 分
              </span>
              <span>10</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(score * 10)}
              onChange={(e) => setScore(Number(e.target.value) / 10)}
              disabled={!canSubmit}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="flex justify-between px-0.5">
              {Array.from({ length: 11 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "text-[10px] tabular-nums",
                    Math.round(score) === i
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground/60",
                  )}
                >
                  {i}
                </span>
              ))}
            </div>
          </div>

          {/* Quick picks */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">快捷：</span>
            {QUICK_SCORES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!canSubmit}
                onClick={() => setScore(s)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
                  score === s
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-accent",
                  !canSubmit && "cursor-not-allowed opacity-50",
                )}
              >
                <StarIcon
                  className={cn("h-3 w-3", score === s && "fill-current")}
                />
                {s}.0
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full sm:w-auto"
          >
            {pending ? "提交中…" : "提交评分"}
          </Button>

          <p className="text-xs text-muted-foreground">
            每人一票，可随时更新；综合推荐指数由所有用户评分的平均值计算。
          </p>
        </div>
      )}
    </section>
  );
}
