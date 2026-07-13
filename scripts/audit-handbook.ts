import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseHandbookRequirementAst,
  validateHandbookRequirementAst,
} from "../src/lib/handbook-requirement";

type ManifestEntry = { file: string };

const dir = resolve(import.meta.dirname, "data/handbook");
const manifest = JSON.parse(
  readFileSync(resolve(dir, "manifest.json"), "utf8"),
) as ManifestEntry[];
const failures: Array<{ file: string; errors: string[] }> = [];
let sections = 0;
let courseReferences = 0;
let sectionsWithSubgroups = 0;
let sectionsWithTextOnlyClauses = 0;
let sectionsWithMultipleUnitClauses = 0;
let clauses = 0;
let clausesWithConstraints = 0;
let constraints = 0;

for (const entry of manifest) {
  const ast = parseHandbookRequirementAst(
    readFileSync(resolve(dir, entry.file), "utf8"),
  );
  const errors = validateHandbookRequirementAst(ast);
  if (errors.length) failures.push({ file: entry.file, errors });
  sections += ast?.sections.length ?? 0;
  courseReferences +=
    ast?.sections.reduce(
      (count, section) => count + section.courses.length,
      0,
    ) ?? 0;
  for (const section of ast?.sections ?? []) {
    if (section.clauses.some((clause) => clause.marker))
      sectionsWithSubgroups++;
    if (
      section.clauses.some((clause) => !clause.courses.length && clause.text)
    ) {
      sectionsWithTextOnlyClauses++;
    }
    if (
      section.clauses.filter((clause) => clause.declaredUnits != null).length >
      1
    ) {
      sectionsWithMultipleUnitClauses++;
    }
    clauses += section.clauses.length;
    clausesWithConstraints += section.clauses.filter(
      (clause) => clause.constraints.length,
    ).length;
    constraints += section.clauses.reduce(
      (count, clause) => count + clause.constraints.length,
      0,
    );
  }
}

console.log(
  JSON.stringify(
    {
      pages: manifest.length,
      sections,
      courseReferences,
      sectionsWithSubgroups,
      sectionsWithTextOnlyClauses,
      sectionsWithMultipleUnitClauses,
      clauses,
      clausesWithConstraints,
      constraints,
      failures,
    },
    null,
    2,
  ),
);
process.exitCode = failures.length ? 1 : 0;
