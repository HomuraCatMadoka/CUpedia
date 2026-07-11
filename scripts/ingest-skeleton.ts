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
import { and, eq, sql } from "drizzle-orm";
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
const dir = resolve(__dirname, "data/handbook");
const manifest = JSON.parse(
  readFileSync(resolve(dir, "manifest.json"), "utf8"),
) as ManifestEntry[];

const parsed = manifest.map((meta) => ({
  meta,
  leaf: parseHandbookLeaf(readFileSync(resolve(dir, meta.file), "utf8")),
}));

const { errors, years } = validateHandbookSnapshot(
  parsed,
  process.argv.includes("--allow-partial"),
);
if (errors.length)
  throw new Error(`Handbook snapshot rejected:\n${errors.join("\n")}`);

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

function snapshotSql() {
  if (!replace) throw new Error("--emit-sql requires --replace");
  const aliases = new Map(
    COURSE_ALIASES.map((row) => [row.oldCode, row.newCode]),
  );
  const statements = [
    "BEGIN;",
    "DO $$ BEGIN IF EXISTS (SELECT 1 FROM builds) THEN RAISE EXCEPTION 'refusing to replace majors while saved builds exist'; END IF; END $$;",
    "DELETE FROM majors;",
  ];
  for (const entry of parsed) {
    const { meta, leaf } = entry;
    const majorId = randomUUID();
    statements.push(
      `INSERT INTO majors (id,name,faculty,total_units,normative_years,handbook_year) VALUES (${quote(majorId)},${quote(snapshotMajorName(entry, parsed))},${quote(meta.faculty)},${leaf.totalUnits ?? "NULL"},4,${quote(meta.handbookYear)});`,
    );
    for (const category of leaf.categories) {
      const categoryId = randomUUID();
      statements.push(
        `INSERT INTO major_categories (id,major_id,name,kind,units_required,pick_n) VALUES (${quote(categoryId)},${quote(majorId)},${quote(category.name)},${quote(category.kind)},${category.unitsRequired ?? "NULL"},${category.pickN ?? "NULL"});`,
      );
      if (category.members.length) {
        const values = category.members.map((code) => {
          const mapped = aliases.get(code) ?? code;
          return `(${quote(categoryId)},${quote(mapped)},NOT EXISTS (SELECT 1 FROM courses WHERE code=${quote(mapped)}))`;
        });
        statements.push(
          `INSERT INTO category_courses (category_id,course_code,missing) VALUES ${values.join(",")};`,
        );
      }
    }
  }
  statements.push("COMMIT;");
  return statements.join("\n");
}

if (emitSql) {
  process.stdout.write(snapshotSql());
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
    const [savedBuild] = replace
      ? await db.select({ id: builds.id }).from(builds).limit(1)
      : [];
    const incoming = new Set(
      parsed.map(
        (entry) =>
          `${snapshotMajorName(entry, parsed)}\0${entry.meta.handbookYear}`,
      ),
    );
    const deletes = replace
      ? existing.filter((row) => !incoming.has(`${row.name}\0${row.year}`))
      : [];
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "preview",
          years,
          incomingMajors: parsed.length,
          existingMajors: existing.length,
          deleteMajors: deletes.map(({ name, year }) => ({ name, year })),
          replaceBlockedBySavedBuilds: !!savedBuild,
        },
        null,
        2,
      ),
    );
    if (!apply) return;
    if (savedBuild)
      throw new Error("refusing to replace majors while saved builds exist");

    const known = new Set(
      (await db.select({ code: courses.code }).from(courses)).map(
        ({ code }) => code,
      ),
    );
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
      let missing = 0;
      let members = 0;
      for (const entry of parsed) {
        const { meta, leaf } = entry;
        const name = snapshotMajorName(entry, parsed);
        await tx
          .delete(majors)
          .where(
            and(
              eq(majors.name, name),
              eq(majors.handbookYear, meta.handbookYear),
            ),
          );
        const [major] = await tx
          .insert(majors)
          .values({
            name,
            faculty: meta.faculty,
            totalUnits:
              leaf.totalUnits == null ? null : String(leaf.totalUnits),
            handbookYear: meta.handbookYear,
          })
          .returning({ id: majors.id });
        for (const category of leaf.categories) {
          const [row] = await tx
            .insert(majorCategories)
            .values({
              majorId: major.id,
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
            members++;
            if (isMissing) missing++;
            return {
              categoryId: row.id,
              courseCode: mapped,
              missing: isMissing,
            };
          });
          if (values.length) await tx.insert(categoryCourses).values(values);
        }
      }
      const ratio = members ? missing / members : 0;
      if (ratio > 0.25)
        throw new Error(
          `missing-course ratio ${(ratio * 100).toFixed(1)}% exceeds 25%`,
        );
      console.log(
        JSON.stringify({ members, missing, missingRatio: ratio }, null, 2),
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
