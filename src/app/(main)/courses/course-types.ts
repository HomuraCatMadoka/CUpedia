// Plain (non-"use server") module so client components and pages can import the
// Course shape and formatting helper. The course catalog itself lives in the
// `courses` table (ingested by the course-tree scraper); this module only holds
// the view-facing type and pure helpers.

/** A course as surfaced to the review UI — a projection of the `courses` row. */
export type Course = {
  code: string;
  subject: string;
  title: string;
  units: number;
  description: string;
  terms: string[];
  genderRestriction: CourseGenderRestriction;
};

export type CourseGenderRestriction = "male" | "female" | null;

/** PHED uses separate course codes for its male- and female-only offerings. */
export function getCourseGenderRestriction(
  subject: string,
  requirementsRaw: string,
): CourseGenderRestriction {
  if (subject.toUpperCase() !== "PHED") return null;
  if (/\bfor\s+female\s+only\b/i.test(requirementsRaw)) return "female";
  // PHED1043 currently contains the source typo "For male olny".
  if (/\bfor\s+male\s+(?:only|olny)\b/i.test(requirementsRaw)) return "male";
  return null;
}

/** Format a stored code ("CSCI3150") for display ("CSCI 3150"). */
export function formatCourseCode(code: string): string {
  const m = code.match(/^([A-Za-z]{4})(\d{4}[A-Za-z]?)$/);
  return m ? `${m[1]} ${m[2]}` : code;
}
