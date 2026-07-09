/**
 * Teaching Staff aggregation from another-cuhk-course-planner JSON exports.
 * See Course_Prompt.md §3.5 for the intended algorithm.
 */

export const TARGET_TERMS = [
  "2025-26 Term 1",
  "2025-26 Term 2",
  "2025-26 Summer Session",
] as const;

export type TargetTerm = (typeof TARGET_TERMS)[number];

export type PlannerMeeting = {
  instructor?: string;
};

export type PlannerSection = {
  meetings?: PlannerMeeting[];
};

export type PlannerTerm = {
  term_name?: string;
  schedule?: PlannerSection[];
};

export type PlannerCourse = {
  subject: string;
  course_code: string;
  terms?: PlannerTerm[];
};

export type PlannerSubjectFile = {
  metadata?: { subject?: string; scraped_at?: string };
  courses: PlannerCourse[];
};

export type TeachingStaffRecord = {
  "Teaching Staff": string;
  "Teaching Courses": string[];
};

export type TeachingStaffDatabase = {
  metadata: {
    scraped_at: string;
    source: string;
    terms: TargetTerm[];
    subject_count: number;
    staff_count: number;
  };
  staff: TeachingStaffRecord[];
};

const INVALID_INSTRUCTORS = new Set(["", "-", "tba", "staff", "to be announced"]);

export function isUndergraduateCourseCode(courseCode: string): boolean {
  const numeric = Number.parseInt(courseCode, 10);
  return Number.isFinite(numeric) && numeric < 5000;
}

export function formatFullCourseCode(subject: string, courseCode: string): string {
  return `${subject}${courseCode}`;
}

export function normalizeInstructor(name: string | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim().replace(/,\s*$/, "");
  if (!trimmed || INVALID_INSTRUCTORS.has(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

/** Some sections list many instructors in one field, separated by ", \\n". */
export function splitInstructors(raw: string | undefined): string[] {
  if (!raw) return [];
  const parts = raw.split(/,\s*\n|\n/);
  const instructors = new Set<string>();
  for (const part of parts) {
    const instructor = normalizeInstructor(part);
    if (instructor) instructors.add(instructor);
  }
  return [...instructors];
}

export function extractInstructorsForTerm(
  course: PlannerCourse,
  termName: TargetTerm,
): string[] {
  const term = course.terms?.find((t) => t.term_name === termName);
  if (!term?.schedule?.length) return [];

  const instructors = new Set<string>();
  for (const section of term.schedule) {
    for (const meeting of section.meetings ?? []) {
      for (const instructor of splitInstructors(meeting.instructor)) {
        instructors.add(instructor);
      }
    }
  }
  return [...instructors];
}

/**
 * Aggregate teaching staff → course codes across terms and subjects.
 * Matches Course_Prompt.md §3.5: skip postgraduate (code >= 5000), merge by staff name.
 */
export function buildTeachingStaffIndex(
  subjectFiles: PlannerSubjectFile[],
  terms: readonly TargetTerm[] = TARGET_TERMS,
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const term of terms) {
    for (const file of subjectFiles) {
      for (const course of file.courses) {
        if (!isUndergraduateCourseCode(course.course_code)) continue;

        const fullCode = formatFullCourseCode(course.subject, course.course_code);
        const instructors = extractInstructorsForTerm(course, term);
        if (instructors.length === 0) continue;

        for (const instructor of instructors) {
          const courses = index.get(instructor) ?? new Set<string>();
          courses.add(fullCode);
          index.set(instructor, courses);
        }
      }
    }
  }

  return index;
}

export function toTeachingStaffDatabase(
  index: Map<string, Set<string>>,
  options: {
    source: string;
    terms?: readonly TargetTerm[];
    subjectCount: number;
    scrapedAt?: string;
  },
): TeachingStaffDatabase {
  const staff: TeachingStaffRecord[] = [...index.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, courses]) => ({
      "Teaching Staff": name,
      "Teaching Courses": [...courses].sort(),
    }));

  return {
    metadata: {
      scraped_at: options.scrapedAt ?? new Date().toISOString(),
      source: options.source,
      terms: [...(options.terms ?? TARGET_TERMS)],
      subject_count: options.subjectCount,
      staff_count: staff.length,
    },
    staff,
  };
}
