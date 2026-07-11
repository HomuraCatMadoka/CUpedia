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
};

/** Format a stored code ("CSCI3150") for display ("CSCI 3150"). */
export function formatCourseCode(code: string): string {
  const m = code.match(/^([A-Za-z]{4})(\d{4}[A-Za-z]?)$/);
  return m ? `${m[1]} ${m[2]}` : code;
}
