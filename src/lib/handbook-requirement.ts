import { expandCodes } from "./handbook-codes";
import {
  parseHandbookConstraints,
  type HandbookConstraint,
} from "./handbook-constraints";
import {
  extractPrincipalRequirementTable,
  groupRequirementSections,
} from "./handbook-structure";

export type HandbookRequirementClause = {
  marker: string;
  text: string;
  declaredUnits: number | null;
  courses: string[];
  constraints: HandbookConstraint[];
};

export type HandbookRequirementSectionAst = {
  marker: string;
  heading: string;
  declaredUnits: number | null;
  courses: string[];
  clauses: HandbookRequirementClause[];
};

export type HandbookRequirementAst = {
  totalUnits: number | null;
  sections: HandbookRequirementSectionAst[];
};

export type ProjectedHandbookCategory = {
  name: string;
  kind: "required" | "one-of" | "basket";
  unitsRequired: number | null;
  pickN: number | null;
  members: string[];
  textualRule?: string;
};

export function parseHandbookRequirementAst(
  html: string,
): HandbookRequirementAst | null {
  const table = extractPrincipalRequirementTable(html);
  if (!table) return null;
  return {
    totalUnits: table.totalUnits,
    sections: groupRequirementSections(table).map((section) => {
      const clauses = section.rows.map((row) => ({
        marker: row.marker,
        text: row.text,
        declaredUnits:
          (row.units ??
            Number(
              row.text.match(/^(\d{1,3})\s+units?\b/i)?.[1] ??
                row.text.match(/:\s*(\d{1,3})(?=\s|$)/)?.[1] ??
                row.text.match(/\s(\d{1,3})(?:\s*\[[a-z]\])?\s*$/i)?.[1] ??
                0,
            )) ||
          null,
        courses: expandCodes(row.text),
        constraints: parseHandbookConstraints(row.text),
      }));
      return {
        marker: section.marker,
        heading: section.heading,
        declaredUnits: section.units,
        courses: [
          ...new Set([
            ...expandCodes(section.heading),
            ...clauses.flatMap((clause) => clause.courses),
          ]),
        ],
        clauses,
      };
    }),
  };
}

export function validateHandbookRequirementAst(
  ast: HandbookRequirementAst | null,
): string[] {
  if (!ast) return ["principal requirement table not found"];
  const errors: string[] = [];
  if (ast.totalUnits == null || ast.totalUnits <= 0)
    errors.push("invalid total units");
  if (!ast.sections.length) errors.push("no numbered requirement sections");
  for (const section of ast.sections) {
    if (!section.heading) errors.push(`${section.marker}: empty heading`);
    if (section.courses.some((code) => !/^[A-Z]{3,4}\d{4}$/.test(code))) {
      errors.push(`${section.marker}: invalid course code`);
    }
  }
  return errors;
}

export function projectHandbookCategories(
  ast: HandbookRequirementAst,
): ProjectedHandbookCategory[] {
  return ast.sections.map((section) => {
    const rule = section.clauses
      .map((clause) => `${clause.marker} ${clause.text}`.trim())
      .filter(Boolean)
      .join(" ");
    const clauseUnits = section.clauses
      .map((clause) => clause.declaredUnits)
      .filter((units): units is number => units != null);
    const unitsRequired =
      section.declaredUnits ??
      (clauseUnits.length
        ? clauseUnits.reduce((sum, units) => sum + units, 0)
        : null);
    const onlyClause = section.clauses.length === 1 ? section.clauses[0] : null;
    const exactCourseConstraint = onlyClause?.constraints.find(
      (constraint) =>
        constraint.dimension === "courses" &&
        constraint.minimum != null &&
        constraint.minimum === constraint.maximum,
    );
    const pickN =
      unitsRequired == null && exactCourseConstraint
        ? exactCourseConstraint.minimum
        : null;
    const hasChoice = /\b(?:any|choose|chosen|select|one of|or)\b|\//i.test(
      rule,
    );
    const kind =
      pickN === 1
        ? "one-of"
        : /^Required Courses?\b/i.test(section.heading) && !hasChoice
          ? "required"
          : "basket";
    return {
      name: section.heading,
      kind,
      unitsRequired,
      pickN,
      members: section.courses,
      ...(rule ? { textualRule: rule } : {}),
    };
  });
}

export function projectLegacyHandbookCategories(
  ast: HandbookRequirementAst,
): ProjectedHandbookCategory[] {
  const projected: ProjectedHandbookCategory[] = [];
  for (const section of ast.sections) {
    if (
      /^Choose any ONE from the following .+ options?$/i.test(section.heading)
    ) {
      projected.push({
        name: "Elective Courses",
        kind: "basket",
        unitsRequired: section.declaredUnits,
        pickN: null,
        members: section.courses,
        textualRule: [
          section.heading,
          ...section.clauses.map((clause) =>
            `${clause.marker} ${clause.text}`.trim(),
          ),
        ].join(" "),
      });
      continue;
    }
    const blocks: Array<{
      name: string;
      clauses: HandbookRequirementClause[];
    }> = [];
    const direct = {
      name: section.heading,
      clauses: [] as HandbookRequirementClause[],
    };
    let current = direct;
    let activeLetter: string | null = null;
    let nestedParent: string | null = null;
    for (let index = 0; index < section.clauses.length; index++) {
      const clause = section.clauses[index];
      const marker = clause.marker
        .match(/^\(([a-z]|ii|iii|iv|v|vi)\)$/i)?.[1]
        .toLowerCase();
      if (!marker) {
        current.clauses.push({
          ...clause,
          text: `${clause.marker} ${clause.text}`.trim(),
        });
        continue;
      }
      if (/^[a-h]$/.test(marker)) {
        activeLetter = marker;
        nestedParent = null;
      } else if (marker === "i") {
        const nextMarker = section.clauses
          .slice(index + 1)
          .find((next) => next.marker)?.marker;
        nestedParent =
          activeLetter && nextMarker === "(ii)" ? activeLetter : null;
      }
      const name = nestedParent
        ? `${section.heading} (${nestedParent}) (${marker})`
        : `${section.heading} (${marker})`;
      current = { name, clauses: [clause] };
      blocks.push(current);
    }
    if (direct.clauses.length || !blocks.length) blocks.unshift(direct);
    for (const block of blocks) {
      const rule = block.clauses
        .map((clause) => `${clause.marker} ${clause.text}`.trim())
        .filter(Boolean)
        .join(" ");
      const members = [
        ...new Set(block.clauses.flatMap((clause) => clause.courses)),
      ];
      const declaredUnits = block.clauses
        .map((clause) => clause.declaredUnits)
        .filter((units): units is number => units != null);
      const unitsRequired =
        block === direct && !blocks.slice(1).length
          ? (section.declaredUnits ??
            (declaredUnits.length
              ? declaredUnits.reduce((sum, units) => sum + units, 0)
              : null))
          : declaredUnits.length
            ? declaredUnits.reduce((sum, units) => sum + units, 0)
            : null;
      const exact = block.clauses
        .flatMap((clause) => clause.constraints)
        .find(
          (constraint) =>
            constraint.dimension === "courses" &&
            constraint.minimum != null &&
            constraint.minimum === constraint.maximum,
        );
      const pickN = unitsRequired == null ? (exact?.minimum ?? null) : null;
      const hasChoice = /\b(?:any|choose|chosen|select|one of|or)\b|\//i.test(
        rule,
      );
      projected.push({
        name: block.name,
        kind:
          pickN === 1
            ? "one-of"
            : /^Required Courses?\b/i.test(block.name) && !hasChoice
              ? "required"
              : "basket",
        unitsRequired,
        pickN,
        members,
        ...(rule ? { textualRule: rule } : {}),
      });
    }
  }
  return projected;
}
