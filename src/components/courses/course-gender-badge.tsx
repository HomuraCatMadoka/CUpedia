import type { CourseGenderRestriction } from "@/app/(main)/courses/course-types";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<Exclude<CourseGenderRestriction, null>, string> = {
  male: "仅限男生",
  female: "仅限女生",
};

export function CourseGenderBadge({
  restriction,
}: {
  restriction: CourseGenderRestriction;
}) {
  if (!restriction) return null;

  return (
    <Badge
      variant="outline"
      className="border-foreground/15 bg-background/70 text-foreground"
    >
      {LABELS[restriction]}
    </Badge>
  );
}
