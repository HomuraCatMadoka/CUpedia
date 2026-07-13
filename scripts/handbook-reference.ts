import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseHandbookLeaf,
  type CategoryKind,
} from "../src/lib/parseHandbookLeaf";

type Group = {
  name: string;
  members: string[];
  textualRule: string | null;
  evidence: string;
};

type ReferenceCategory = {
  name: string;
  kind: CategoryKind;
  unitsRequired: number | null;
  pickN: number | null;
  members: string[];
  textualRule: string | null;
  groups: Group[];
  constraints: string[];
  evidence: string;
};

type Reference = {
  sourceFile: string;
  programme: string;
  handbookYear: string;
  title: string;
  totalUnits: number;
  categories: ReferenceCategory[];
  evidence: { title: string; totalUnits: string };
  confidence: number;
  ambiguities: string[];
};

const root = resolve(import.meta.dirname, "data");
const sourceDir = resolve(root, "handbook");
const referenceDir = resolve(root, "handbook-reference");
const normalize = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function load(path: string): Reference {
  const row = JSON.parse(readFileSync(path, "utf8")) as Reference;
  assert(typeof row.sourceFile === "string", `${path}: sourceFile`);
  assert(typeof row.programme === "string", `${path}: programme`);
  assert(/^20\d{2}-\d{2}$/.test(row.handbookYear), `${path}: handbookYear`);
  assert(
    typeof row.title === "string" && row.title.length > 0,
    `${path}: title`,
  );
  assert(
    !/Major Programme Requirement/i.test(row.title),
    `${path}: title contains section heading`,
  );
  assert(Number.isFinite(row.totalUnits), `${path}: totalUnits`);
  assert(
    Array.isArray(row.categories) && row.categories.length > 0,
    `${path}: categories`,
  );
  assert(row.confidence >= 0 && row.confidence <= 1, `${path}: confidence`);
  assert(Array.isArray(row.ambiguities), `${path}: ambiguities`);
  for (const category of row.categories) {
    assert(
      ["required", "one-of", "basket"].includes(category.kind),
      `${path}: category kind`,
    );
    assert(Array.isArray(category.members), `${path}: category members`);
    assert(Array.isArray(category.groups), `${path}: category groups`);
    assert(
      Array.isArray(category.constraints),
      `${path}: category constraints`,
    );
    assert(
      new Set(category.members).size === category.members.length,
      `${path}: duplicate category members`,
    );
    assert(
      category.members.every((code) => /^[A-Z]{3,4}\d{4}$/.test(code)),
      `${path}: invalid category member`,
    );
    for (const group of category.groups) {
      assert(
        new Set(group.members).size === group.members.length,
        `${path}: duplicate group members`,
      );
      assert(
        group.members.every((code) => /^[A-Z]{3,4}\d{4}$/.test(code)),
        `${path}: invalid group member`,
      );
    }
  }
  return row;
}

const requested = process.argv[2];
const files = readdirSync(referenceDir).filter(
  (file) =>
    file.endsWith(".reference.json") && (!requested || file === requested),
);
assert(files.length > 0, "no reference records found");

let differences = 0;
let invalidEvidence = 0;
const differenceKinds: Record<string, number> = {};
for (const file of files) {
  const reference = load(resolve(referenceDir, file));
  const sourcePath = resolve(sourceDir, reference.sourceFile);
  assert(
    existsSync(sourcePath),
    `${file}: missing source ${reference.sourceFile}`,
  );
  const html = readFileSync(sourcePath, "utf8");
  const source = normalize(html);
  const evidence = [
    reference.evidence.title,
    reference.evidence.totalUnits,
    ...reference.categories.flatMap((category) => [
      category.evidence,
      ...category.groups.map((group) => group.evidence),
    ]),
  ];
  for (const quote of evidence) {
    if (source.includes(normalize(quote))) continue;
    invalidEvidence++;
    console.error(`${file} | evidence not found | ${quote}`);
  }

  const parsed = parseHandbookLeaf(html);
  const report = (field: string, expected: unknown, actual: unknown) => {
    if (JSON.stringify(expected) === JSON.stringify(actual)) return;
    differences++;
    const kind = field.startsWith("category:")
      ? "missingCategory"
      : (field.match(
          /(?:^|\.)(title|totalUnits|members|kind|unitsRequired|pickN)$/,
        )?.[1] ?? "other");
    differenceKinds[kind] = (differenceKinds[kind] ?? 0) + 1;
    console.log(
      `${reference.sourceFile} | ${field} | expected ${JSON.stringify(expected)} | actual ${JSON.stringify(actual)}`,
    );
  };
  const codes = (values: string[]) => [...new Set(values)].sort();
  const categoryName = (value: string) => value.replace(/^\d+\s*\.\s*/, "");
  report("title", reference.title, parsed.title);
  report("totalUnits", reference.totalUnits, parsed.totalUnits);
  for (const expected of reference.categories) {
    const expectedName = categoryName(expected.name);
    const exact = parsed.categories.find(
      ({ name }) => categoryName(name) === expectedName,
    );
    const children = parsed.categories.filter(({ name }) =>
      categoryName(name).startsWith(`${expectedName} (`),
    );
    const actual = exact ?? children[0];
    if (!actual) {
      report(`category:${expected.name}`, "present", "missing");
      continue;
    }
    if (exact) {
      report(`${expected.name}.kind`, expected.kind, exact.kind);
      report(
        `${expected.name}.unitsRequired`,
        expected.unitsRequired,
        exact.unitsRequired,
      );
      report(`${expected.name}.pickN`, expected.pickN, exact.pickN);
    }
    report(
      `${expected.name}.members`,
      codes([
        ...expected.members,
        ...expected.groups.flatMap((group) => group.members),
      ]),
      codes(
        [exact, ...children].filter(Boolean).flatMap((row) => row!.members),
      ),
    );
  }
}

console.log(
  JSON.stringify({
    references: files.length,
    invalidEvidence,
    qaDifferences: differences,
    differenceKinds,
  }),
);
// Spark opinions are an audit signal, never a parser oracle or release gate.
// Only structurally invalid/source-less QA records make this command fail.
process.exitCode = invalidEvidence ? 1 : 0;
