// Preview/apply a complete, validated Handbook Major Programme snapshot.
// Default is read-only. Use --apply to write; add --replace only for a full
// refresh after reviewing the preview and taking a database backup.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local"), quiet: true });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import {
  majors,
  majorCategories,
  categoryCourses,
  courseAliases,
  courses,
  builds,
} from "../src/db/schema";
import { parseHandbookLeaf } from "../src/lib/parseHandbookLeaf";
import {
  snapshotMajorName,
  validateHandbookSnapshot,
} from "../src/lib/handbook-snapshot";
import { COURSE_ALIASES } from "./course-aliases-seed";

type ManifestEntry = {
  file: string;
  programme: string;
  programmeKind: "major";
  handbookYear: string;
  faculty: string;
  sourceUrl: string;
  sourceId: string;
};

const apply = process.argv.includes("--apply");
const replace = process.argv.includes("--replace");
const emitSql = process.argv.includes("--emit-sql");
const emitJson = process.argv.includes("--emit-json");
const dir = resolve(__dirname, "data/handbook");
const manifest = JSON.parse(
  readFileSync(resolve(dir, "manifest.json"), "utf8"),
) as ManifestEntry[];

const parsed = manifest.map((meta) => ({
  meta,
  leaf: parseHandbookLeaf(readFileSync(resolve(dir, meta.file), "utf8")),
}));
type ParsedEntry = (typeof parsed)[number];

type SnapshotCategory = {
  name: string;
  kind: string;
  unitsRequired: number | null;
  pickN: number | null;
  members: string[];
};

const snapshotKey = (name: string, year: string) => `${name}\0${year}`;
const fingerprint = (
  name: string,
  faculty: string | null,
  totalUnits: number | null,
  categories: SnapshotCategory[],
) =>
  JSON.stringify({
    name,
    faculty,
    totalUnits,
    categories: categories
      .map((category) => ({
        ...category,
        members: [...new Set(category.members)].sort(),
      }))
      .sort((a, b) =>
        `${a.name}\0${a.kind}\0${a.unitsRequired}\0${a.pickN}`.localeCompare(
          `${b.name}\0${b.kind}\0${b.unitsRequired}\0${b.pickN}`,
        ),
      ),
  });

const incomingFingerprint = (
  entry: ParsedEntry,
  aliases: Map<string, string>,
) =>
  fingerprint(
    snapshotMajorName(entry, parsed),
    entry.meta.faculty,
    entry.leaf.totalUnits,
    entry.leaf.categories.map((category) => ({
      name: category.name,
      kind: category.kind,
      unitsRequired: category.unitsRequired,
      pickN: category.pickN,
      members: category.members.map((code) => aliases.get(code) ?? code),
    })),
  );

const { errors, years } = validateHandbookSnapshot(
  parsed,
  process.argv.includes("--allow-partial"),
);
if (errors.length)
  throw new Error(`Handbook snapshot rejected:\n${errors.join("\n")}`);

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function snapshotRows() {
  const aliases = new Map(
    COURSE_ALIASES.map((row) => [row.oldCode, row.newCode]),
  );
  const rows = {
    majors: [] as Array<{
      id: string;
      name: string;
      faculty: string;
      totalUnits: number | null;
      handbookYear: string;
    }>,
    categories: [] as Array<{
      id: string;
      majorId: string;
      name: string;
      kind: string;
      unitsRequired: number | null;
      pickN: number | null;
    }>,
    members: [] as Array<{
      categoryId: string;
      courseCode: string;
    }>,
  };
  for (const entry of parsed) {
    const { meta, leaf } = entry;
    const majorId = randomUUID();
    rows.majors.push({
      id: majorId,
      name: snapshotMajorName(entry, parsed),
      faculty: meta.faculty,
      totalUnits: leaf.totalUnits,
      handbookYear: meta.handbookYear,
    });
    for (const category of leaf.categories) {
      const categoryId = randomUUID();
      rows.categories.push({
        id: categoryId,
        majorId,
        name: category.name,
        kind: category.kind,
        unitsRequired: category.unitsRequired,
        pickN: category.pickN,
      });
      rows.members.push(
        ...category.members.map((code) => ({
          categoryId,
          courseCode: aliases.get(code) ?? code,
        })),
      );
    }
  }
  return rows;
}

function snapshotSql() {
  if (!replace) throw new Error("--emit-sql requires --replace");
  const statements = [
    "BEGIN;",
    "DO $$ BEGIN IF EXISTS (SELECT 1 FROM builds) THEN RAISE EXCEPTION 'refusing to replace majors while saved builds exist'; END IF; END $$;",
    "DELETE FROM majors;",
  ];
  const rows = snapshotRows();
  for (const major of rows.majors) {
    statements.push(
      `INSERT INTO majors (id,name,faculty,total_units,normative_years,handbook_year) VALUES (${quote(major.id)},${quote(major.name)},${quote(major.faculty)},${major.totalUnits ?? "NULL"},4,${quote(major.handbookYear)});`,
    );
  }
  for (const category of rows.categories) {
    statements.push(
      `INSERT INTO major_categories (id,major_id,name,kind,units_required,pick_n) VALUES (${quote(category.id)},${quote(category.majorId)},${quote(category.name)},${quote(category.kind)},${category.unitsRequired ?? "NULL"},${category.pickN ?? "NULL"});`,
    );
    const members = rows.members.filter(
      ({ categoryId }) => categoryId === category.id,
    );
    if (members.length) {
      const values = members.map(
        ({ courseCode }) =>
          `(${quote(category.id)},${quote(courseCode)},NOT EXISTS (SELECT 1 FROM courses WHERE code=${quote(courseCode)}))`,
      );
      statements.push(
        `INSERT INTO category_courses (category_id,course_code,missing) VALUES ${values.join(",")};`,
      );
    }
  }
  statements.push("COMMIT;");
  return statements.join("\n");
}

if (emitSql) {
  process.stdout.write(snapshotSql());
  process.exit(0);
}

if (emitJson) {
  if (!replace) throw new Error("--emit-json requires --replace");
  process.stdout.write(JSON.stringify(snapshotRows()));
  process.exit(0);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  try {
    const existing = await db
      .select({ id: majors.id, name: majors.name, year: majors.handbookYear })
      .from(majors);
    const aliases = new Map([
      ...COURSE_ALIASES.map((row) => [row.oldCode, row.newCode] as const),
      ...(await db.select().from(courseAliases)).map(
        (row) => [row.oldCode, row.newCode] as const,
      ),
    ]);
    const known = new Set(
      (await db.select({ code: courses.code }).from(courses)).map(
        ({ code }) => code,
      ),
    );
    const storedRows = await db
      .select({
        majorId: majors.id,
        name: majors.name,
        faculty: majors.faculty,
        totalUnits: majors.totalUnits,
        year: majors.handbookYear,
        categoryId: majorCategories.id,
        categoryName: majorCategories.name,
        categoryKind: majorCategories.kind,
        categoryUnits: majorCategories.unitsRequired,
        categoryPickN: majorCategories.pickN,
        courseCode: categoryCourses.courseCode,
      })
      .from(majors)
      .leftJoin(majorCategories, eq(majorCategories.majorId, majors.id))
      .leftJoin(
        categoryCourses,
        eq(categoryCourses.categoryId, majorCategories.id),
      );
    const stored = new Map<
      string,
      {
        id: string;
        name: string;
        faculty: string | null;
        totalUnits: number | null;
        categories: Map<string, SnapshotCategory>;
      }
    >();
    for (const row of storedRows) {
      let major = stored.get(row.majorId);
      if (!major) {
        major = {
          id: row.majorId,
          name: row.name,
          faculty: row.faculty,
          totalUnits: row.totalUnits == null ? null : Number(row.totalUnits),
          categories: new Map(),
        };
        stored.set(row.majorId, major);
      }
      if (!row.categoryId || !row.categoryName || !row.categoryKind) continue;
      let category = major.categories.get(row.categoryId);
      if (!category) {
        category = {
          name: row.categoryName,
          kind: row.categoryKind,
          unitsRequired:
            row.categoryUnits == null ? null : Number(row.categoryUnits),
          pickN: row.categoryPickN,
          members: [],
        };
        major.categories.set(row.categoryId, category);
      }
      if (row.courseCode) category.members.push(row.courseCode);
    }
    const storedByKey = new Map<
      string,
      Array<{ id: string; fingerprint: string }>
    >();
    for (const major of stored.values()) {
      const row = existing.find(({ id }) => id === major.id)!;
      const key = snapshotKey(major.name, row.year);
      const values = storedByKey.get(key) ?? [];
      values.push({
        id: major.id,
        fingerprint: fingerprint(major.name, major.faculty, major.totalUnits, [
          ...major.categories.values(),
        ]),
      });
      storedByKey.set(key, values);
    }
    const [savedBuild] = replace
      ? await db.select({ id: builds.id }).from(builds).limit(1)
      : [];
    const incoming = new Set(
      parsed.map((entry) =>
        snapshotKey(snapshotMajorName(entry, parsed), entry.meta.handbookYear),
      ),
    );
    const deletes = replace
      ? existing.filter((row) => !incoming.has(snapshotKey(row.name, row.year)))
      : [];
    const additions: string[] = [];
    const updates: string[] = [];
    const skips: string[] = [];
    let incomingCategories = 0;
    let incomingMembers = 0;
    let incomingMissing = 0;
    const incomingByYear = new Map<
      string,
      { majors: number; categories: number; members: number; missing: number }
    >();
    for (const entry of parsed) {
      const name = snapshotMajorName(entry, parsed);
      const key = snapshotKey(name, entry.meta.handbookYear);
      const matches = storedByKey.get(key) ?? [];
      if (!matches.length) additions.push(key);
      else if (
        matches.length === 1 &&
        matches[0].fingerprint === incomingFingerprint(entry, aliases)
      ) {
        skips.push(key);
      } else {
        updates.push(key);
      }
      incomingCategories += entry.leaf.categories.length;
      const yearStats = incomingByYear.get(entry.meta.handbookYear) ?? {
        majors: 0,
        categories: 0,
        members: 0,
        missing: 0,
      };
      yearStats.majors++;
      yearStats.categories += entry.leaf.categories.length;
      for (const category of entry.leaf.categories) {
        for (const code of category.members) {
          incomingMembers++;
          yearStats.members++;
          if (!known.has(aliases.get(code) ?? code)) {
            incomingMissing++;
            yearStats.missing++;
          }
        }
      }
      incomingByYear.set(entry.meta.handbookYear, yearStats);
    }
    const yearStats = Object.fromEntries(
      [...incomingByYear]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, stats]) => [
          year,
          {
            ...stats,
            missingRatio: stats.members ? stats.missing / stats.members : 0,
          },
        ]),
    );
    const missingThreshold = 0.25;
    const duplicateExisting = [...storedByKey]
      .filter(([, values]) => values.length > 1)
      .map(([key, values]) => ({ key, ids: values.map(({ id }) => id) }));
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "preview",
          years,
          incomingMajors: parsed.length,
          incomingCategories,
          incomingMembers,
          incomingMissing,
          incomingMissingRatio:
            incomingMembers > 0 ? incomingMissing / incomingMembers : 0,
          missingThreshold,
          missingThresholdExceeded:
            incomingMembers > 0 &&
            incomingMissing / incomingMembers > missingThreshold,
          yearStats,
          existingMajors: existing.length,
          additions,
          updates,
          skips,
          duplicateExisting,
          deleteMajors: deletes.map(({ name, year }) => ({ name, year })),
          replaceBlockedBySavedBuilds: !!savedBuild,
        },
        null,
        2,
      ),
    );
    if (!apply) return;
    if (duplicateExisting.length)
      throw new Error(
        "refusing to apply while duplicate major/year rows exist",
      );
    if (savedBuild)
      throw new Error("refusing to replace majors while saved builds exist");

    await db.transaction(async (tx) => {
      if (COURSE_ALIASES.length) {
        await tx
          .insert(courseAliases)
          .values(COURSE_ALIASES)
          .onConflictDoUpdate({
            target: courseAliases.oldCode,
            set: { newCode: sql`excluded.new_code` },
          });
      }
      const aliases = new Map(
        (await tx.select().from(courseAliases)).map((row) => [
          row.oldCode,
          row.newCode,
        ]),
      );
      if (replace && deletes.length) {
        for (const row of deletes)
          await tx.delete(majors).where(eq(majors.id, row.id));
      }
      const skipKeys = new Set(skips);
      for (const entry of parsed) {
        const { meta, leaf } = entry;
        const name = snapshotMajorName(entry, parsed);
        const key = snapshotKey(name, meta.handbookYear);
        if (skipKeys.has(key)) continue;
        const existingMajor = storedByKey.get(key)?.[0];
        const values = {
          name,
          faculty: meta.faculty,
          totalUnits: leaf.totalUnits == null ? null : String(leaf.totalUnits),
          handbookYear: meta.handbookYear,
        };
        let majorId: string;
        if (existingMajor) {
          await tx
            .update(majors)
            .set(values)
            .where(eq(majors.id, existingMajor.id));
          await tx
            .delete(majorCategories)
            .where(eq(majorCategories.majorId, existingMajor.id));
          majorId = existingMajor.id;
        } else {
          const [major] = await tx
            .insert(majors)
            .values(values)
            .returning({ id: majors.id });
          majorId = major.id;
        }
        for (const category of leaf.categories) {
          const [row] = await tx
            .insert(majorCategories)
            .values({
              majorId,
              name: category.name,
              kind: category.kind,
              unitsRequired:
                category.unitsRequired == null
                  ? null
                  : String(category.unitsRequired),
              pickN: category.pickN,
            })
            .returning({ id: majorCategories.id });
          const values = category.members.map((courseCode) => {
            const mapped = aliases.get(courseCode) ?? courseCode;
            const isMissing = !known.has(mapped);
            return {
              categoryId: row.id,
              courseCode: mapped,
              missing: isMissing,
            };
          });
          if (values.length) await tx.insert(categoryCourses).values(values);
        }
      }
      const ratio = incomingMembers ? incomingMissing / incomingMembers : 0;
      if (ratio > missingThreshold)
        throw new Error(
          `missing-course ratio ${(ratio * 100).toFixed(1)}% exceeds ${missingThreshold * 100}%`,
        );
      console.log(
        JSON.stringify(
          {
            members: incomingMembers,
            missing: incomingMissing,
            missingRatio: ratio,
          },
          null,
          2,
        ),
      );
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
