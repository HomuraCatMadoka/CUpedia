import { createHash } from "node:crypto";

export type TeachingStaffSource = {
  name: string;
  courses: string[];
};

export type ProfessorCatalogRecord = TeachingStaffSource & {
  id: string;
  searchText: string;
  identityProfileUrl?: string;
  identityEvidenceUrl?: string;
};

export type CourseInstructorOverride = {
  coursePrefix: string;
  instructorName: string;
  profileUrl: string;
  evidenceUrl: string;
};

const INVALID_NAMES = new Set([
  "",
  "-",
  "staff",
  "tba",
  "to be announced",
  "pr",
  "pro",
  "prof",
  "profes",
  "profess",
  "professor",
  "prof.",
  "doctor",
  "dr",
  "dr.",
  "mr",
  "mr.",
  "ms",
  "ms.",
  "miss",
]);

export function normalizeProfessorName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s*<+\s*$/, "")
    .replace(/,\s*$/, "")
    .replace(/^(professor|prof\.)\s+/i, "Professor ")
    .replace(/^(doctor|dr\.)\s+/i, "Dr. ")
    .replace(/\s+/g, " ");
}

export function isValidProfessorName(value: string): boolean {
  return !INVALID_NAMES.has(normalizeProfessorName(value).toLocaleLowerCase());
}

export function professorId(name: string, identityKey?: string): string {
  const identity = [
    normalizeProfessorName(name).toLowerCase(),
    identityKey?.toLowerCase(),
  ]
    .filter(Boolean)
    .join("\0");
  return createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

export function buildProfessorCatalog(
  sources: TeachingStaffSource[],
  overrides: CourseInstructorOverride[] = [],
): ProfessorCatalogRecord[] {
  const records = new Map<string, ProfessorCatalogRecord>();
  for (const source of sources) {
    const name = normalizeProfessorName(source.name);
    if (!isValidProfessorName(name)) continue;
    for (const course of source.courses.map((code) =>
      code.replace(/\s+/g, "").toUpperCase(),
    )) {
      const override = overrides.find(
        (item) =>
          normalizeProfessorName(item.instructorName) === name &&
          course.startsWith(item.coursePrefix.toUpperCase()),
      );
      const id = professorId(name, override?.profileUrl);
      const existing = records.get(id);
      records.set(id, {
        id,
        name,
        searchText: name.toLocaleLowerCase(),
        courses: [...new Set([...(existing?.courses ?? []), course])].sort(),
        ...(override
          ? {
              identityProfileUrl: override.profileUrl,
              identityEvidenceUrl: override.evidenceUrl,
            }
          : {}),
      });
    }
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name));
}
