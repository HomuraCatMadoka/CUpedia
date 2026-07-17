export type SubjectCountRule = {
  subjectCodes: string[];
  requiredCount: number;
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
  const subjects = new Set(rule.subjectCodes);
  const seenCourses = new Set<string>();
  const matches = ratings
    .filter((rating) => {
      if (
        occupiedRatingIds.has(rating.id) ||
        !subjects.has(rating.subject) ||
        seenCourses.has(rating.courseCode)
      ) {
        return false;
      }
      seenCourses.add(rating.courseCode);
      return true;
    })
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));

  return {
    eligible: matches.length >= rule.requiredCount,
    matchedCount: Math.min(matches.length, rule.requiredCount),
    requiredCount: rule.requiredCount,
    evidenceRatingIds: matches
      .slice(0, rule.requiredCount)
      .map((rating) => rating.id),
  };
}
