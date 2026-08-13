export const COURSE_TERMS = ["Term 1", "Term 2", "Summer"] as const;

export type CourseTerm = (typeof COURSE_TERMS)[number];

export const COURSE_REVIEW_TAG_DIMENSIONS = {
  workload: {
    label: "Workload",
    gridClassName: "grid-cols-2",
    options: ["chur", "hea"],
    storageValues: { chur: "heavy", hea: "light" },
  },
  grade: {
    label: "Grade",
    gridClassName: "grid-cols-2",
    options: ["靓 grade", "烂 grade"],
    storageValues: { "靓 grade": "good", "烂 grade": "bad" },
  },
  enrollment: {
    label: "抢课难度",
    gridClassName: "grid-cols-2",
    options: ["课难抢", "点击即送"],
    storageValues: { 课难抢: "hard", 点击即送: "easy" },
  },
  attendance: {
    label: "考勤要求",
    gridClassName: "grid-cols-2",
    options: ["要 attendance", "无 attendance"],
    storageValues: {
      "要 attendance": "required",
      "无 attendance": "not_required",
    },
  },
  language: {
    label: "课堂语言",
    gridClassName: "grid-cols-3",
    options: ["普通话", "英语", "粤语"],
    storageValues: {
      普通话: "mandarin",
      英语: "english",
      粤语: "cantonese",
    },
  },
} as const;

export type CourseReviewTagDimension =
  keyof typeof COURSE_REVIEW_TAG_DIMENSIONS;

export const COURSE_REVIEW_TAG_OPTIONS = Object.fromEntries(
  Object.entries(COURSE_REVIEW_TAG_DIMENSIONS).map(([dimension, config]) => [
    dimension,
    config.options,
  ]),
) as {
  [Dimension in CourseReviewTagDimension]: (typeof COURSE_REVIEW_TAG_DIMENSIONS)[Dimension]["options"];
};

/** Stable database values keyed by the labels currently shown in the UI. */
export const COURSE_REVIEW_TAG_STORAGE_VALUES = Object.fromEntries(
  Object.entries(COURSE_REVIEW_TAG_DIMENSIONS).map(([dimension, config]) => [
    dimension,
    config.storageValues,
  ]),
) as {
  [Dimension in CourseReviewTagDimension]: (typeof COURSE_REVIEW_TAG_DIMENSIONS)[Dimension]["storageValues"];
};

export type CourseReviewTags = {
  [Dimension in CourseReviewTagDimension]?: (typeof COURSE_REVIEW_TAG_DIMENSIONS)[Dimension]["options"][number];
} & {
  custom?: string[];
};
