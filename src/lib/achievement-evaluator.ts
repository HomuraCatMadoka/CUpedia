export type SubjectCountRule = {
  subjectGroups: Array<{ subjectCodes: string[]; requiredCount: number }>;
};

export type AchievementRating = {
  id: string;
  courseCode: string;
  subject: string;
};

export type SubjectCountEvaluation = {
  eligible: boolean;
  matchedCount: number;
  requiredCount: number;
  evidenceRatingIds: string[];
};

export function evaluateSubjectCountRule(
  rule: SubjectCountRule,
  ratings: AchievementRating[],
  occupiedRatingIds: ReadonlySet<string> = new Set(),
): SubjectCountEvaluation {
  const seenCourses = new Set<string>();
  const candidates = ratings
    .filter((rating) => {
      if (
        occupiedRatingIds.has(rating.id) ||
        seenCourses.has(rating.courseCode)
      ) {
        return false;
      }
      seenCourses.add(rating.courseCode);
      return true;
    })
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));

  const slots = rule.subjectGroups.flatMap((group) =>
    Array.from(
      { length: group.requiredCount },
      () => new Set(group.subjectCodes),
    ),
  );
  const slotAssignments = new Map<number, number>();

  function assign(ratingIndex: number, visited: Set<number>): boolean {
    const rating = candidates[ratingIndex];
    for (const [slotIndex, subjects] of slots.entries()) {
      if (visited.has(slotIndex) || !subjects.has(rating.subject)) continue;
      visited.add(slotIndex);
      const previousRating = slotAssignments.get(slotIndex);
      if (previousRating === undefined || assign(previousRating, visited)) {
        slotAssignments.set(slotIndex, ratingIndex);
        return true;
      }
    }
    return false;
  }

  for (const ratingIndex of candidates.keys()) assign(ratingIndex, new Set());

  const requiredCount = slots.length;
  const evidenceRatingIds = [...new Set(slotAssignments.values())]
    .sort((a, b) => a - b)
    .map((index) => candidates[index].id);

  return {
    eligible: evidenceRatingIds.length >= requiredCount,
    matchedCount: evidenceRatingIds.length,
    requiredCount,
    evidenceRatingIds,
  };
}
