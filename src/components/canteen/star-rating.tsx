// ==========================================================================
// StarRating — reusable star display component
// Props: score (0–5), size ("sm" | "md" | "lg")
// ==========================================================================

import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "text-xs gap-px",
  md: "text-sm gap-px",
  lg: "text-xl gap-0.5",
} as const;

interface StarRatingProps {
  score: number;
  size?: keyof typeof sizeClasses;
  className?: string;
}

export function StarRating({ score, size = "sm", className }: StarRatingProps) {
  const fullStars = Math.floor(score);
  const emptyStars = 5 - fullStars;

  return (
    <span className={cn("inline-flex", sizeClasses[size], className)}>
      {Array.from({ length: fullStars }, (_, i) => (
        <span key={`f-${i}`} className="text-[#e5c01b]">
          ★
        </span>
      ))}
      {Array.from({ length: emptyStars }, (_, i) => (
        <span key={`e-${i}`} className="text-[#d4d4d4]">
          ★
        </span>
      ))}
    </span>
  );
}
