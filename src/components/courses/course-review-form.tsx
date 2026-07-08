"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon, StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SCORE_FIELDS = [
  { key: "rating", label: "Overall" },
  { key: "difficulty", label: "Difficulty" },
  { key: "workload", label: "Workload" },
  { key: "grading", label: "Grading" },
] as const;

type ScoreKey = (typeof SCORE_FIELDS)[number]["key"];
type Scores = Record<ScoreKey, number>;

const INITIAL_SCORES: Scores = {
  rating: 4,
  difficulty: 3,
  workload: 3,
  grading: 4,
};

function formatScore(value: number) {
  return value.toFixed(1);
}

function scoreButtonClass(value: number, score: number) {
  if (value >= score) {
    return "border-foreground bg-foreground text-background";
  }
  if (value >= score - 0.5) {
    return "border-foreground bg-muted text-foreground";
  }
  return "border-border text-muted-foreground hover:bg-muted";
}

function ScorePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {formatScore(value)}/5
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            onDoubleClick={() => onChange(score - 0.5)}
            className={cn(
              "flex h-8 items-center justify-center rounded-lg border text-xs transition-colors",
              scoreButtonClass(value, score),
            )}
            aria-label={`${label} ${score}. Double click for ${score - 0.5}`}
            title="Click for a full star, double click for a half star"
          >
            <StarIcon
              className={cn(
                "size-3.5",
                value >= score && "fill-current",
                value >= score - 0.5 &&
                  value < score &&
                  "fill-current opacity-50",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function CourseReviewForm({
  courseCode,
  isAuthenticated,
}: {
  courseCode: string;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Scores>(INITIAL_SCORES);
  const [term, setTerm] = useState("");
  const [instructor, setInstructor] = useState("");
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function setScore(key: ScoreKey, value: number) {
    setScores((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/courses/${courseCode}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...scores,
          term,
          instructor,
          content,
          anonymous,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Failed to submit review");
        return;
      }

      setContent("");
      setTerm("");
      setInstructor("");
      setAnonymous(true);
      router.refresh();
    });
  }

  if (!isAuthenticated) {
    return (
      <section className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline">
          Log in
        </Link>{" "}
        to write a review.
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {SCORE_FIELDS.map((field) => (
          <ScorePicker
            key={field.key}
            label={field.label}
            value={scores[field.key]}
            onChange={(value) => setScore(field.key, value)}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Term, e.g. 2025 Fall"
          maxLength={40}
        />
        <Input
          value={instructor}
          onChange={(event) => setInstructor(event.target.value)}
          placeholder="Instructor"
          maxLength={80}
        />
      </div>

      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Share course content, workload, grading, and tips..."
        className="mt-3 min-h-28 resize-none"
        maxLength={3000}
        required
      />

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={anonymous}
            onCheckedChange={(checked) => setAnonymous(checked === true)}
          />
          Show anonymously
        </label>
        <Button type="submit" disabled={pending || !content.trim()}>
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <CheckIcon className="size-4" />
          )}
          {pending ? "Submitting" : "Submit review"}
        </Button>
      </div>
    </form>
  );
}
