export const COURSE_TERMS = ["Term 1", "Term 2", "Summer"] as const;

export type CourseTerm = (typeof COURSE_TERMS)[number];
