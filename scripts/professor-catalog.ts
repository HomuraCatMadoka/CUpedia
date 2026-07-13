import { createHash } from "node:crypto";

export type TeachingStaffSource = {
  name: string;
  courses: string[];
};

export type ProfessorCatalogRecord = TeachingStaffSource & {
  id: string;
  searchText: string;
};

const INVALID_NAMES = new Set(["", "-", "staff", "tba", "to be announced"]);

export function normalizeProfessorName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/,\s*$/, "")
    .replace(/^(professor|prof\.)\s+/i, "Professor ")
    .replace(/^(doctor|dr\.)\s+/i, "Dr. ")
    .replace(/\s+/g, " ");
}

export function professorId(name: string): string {
  const identity = normalizeProfessorName(name).toLocaleLowerCase();
  return createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

export function buildProfessorCatalog(
  sources: TeachingStaffSource[],
): ProfessorCatalogRecord[] {
  const records = new Map<string, ProfessorCatalogRecord>();
  for (const source of sources) {
    const name = normalizeProfessorName(source.name);
    if (INVALID_NAMES.has(name.toLocaleLowerCase())) continue;
    const id = professorId(name);
    const existing = records.get(id);
    records.set(id, {
      id,
      name,
      searchText: name.toLocaleLowerCase(),
      courses: [...new Set([...(existing?.courses ?? []), ...source.courses])]
        .map((code) => code.replace(/\s+/g, "").toUpperCase())
        .sort(),
    });
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name));
}
