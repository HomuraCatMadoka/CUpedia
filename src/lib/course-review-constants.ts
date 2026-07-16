export const COURSE_TERMS = ["Term 1", "Term 2", "Summer"] as const;

export type CourseTerm = (typeof COURSE_TERMS)[number];

export const COURSE_REVIEW_TAG_OPTIONS = {
  workload: ["chur", "hea"],
  grade: ["靓 grade", "烂 grade"],
  enrollment: ["课难抢", "点击即送"],
} as const;

export type CourseReviewTags = {
  workload?: (typeof COURSE_REVIEW_TAG_OPTIONS.workload)[number];
  grade?: (typeof COURSE_REVIEW_TAG_OPTIONS.grade)[number];
  enrollment?: (typeof COURSE_REVIEW_TAG_OPTIONS.enrollment)[number];
  custom?: string[];
};
