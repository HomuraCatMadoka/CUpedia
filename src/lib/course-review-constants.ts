export const COURSE_TERMS = ["Term 1", "Term 2", "Summer"] as const;

export type CourseTerm = (typeof COURSE_TERMS)[number];

export const COURSE_REVIEW_TAG_OPTIONS = {
  workload: ["chur", "hea"],
  grade: ["靓 grade", "烂 grade"],
  enrollment: ["课难抢", "点击即送"],
  attendance: ["要 attendance", "无 attendance"],
} as const;

/** Stable database values keyed by the labels currently shown in the UI. */
export const COURSE_REVIEW_TAG_STORAGE_VALUES = {
  workload: { chur: "heavy", hea: "light" },
  grade: { "靓 grade": "good", "烂 grade": "bad" },
  enrollment: { 课难抢: "hard", 点击即送: "easy" },
  attendance: {
    "要 attendance": "required",
    "无 attendance": "not_required",
  },
} as const;

export type CourseReviewTags = {
  workload?: (typeof COURSE_REVIEW_TAG_OPTIONS.workload)[number];
  grade?: (typeof COURSE_REVIEW_TAG_OPTIONS.grade)[number];
  enrollment?: (typeof COURSE_REVIEW_TAG_OPTIONS.enrollment)[number];
  attendance?: (typeof COURSE_REVIEW_TAG_OPTIONS.attendance)[number];
  custom?: string[];
};
