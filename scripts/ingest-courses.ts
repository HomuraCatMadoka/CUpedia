// 摄取课程目录：scripts/data/courses.json → normalizeCourse → upsert courses 表。
// 数据由 tools/scraper/scrape_courses.py 产出。幂等（按 code 冲突更新）。
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { courses, courseSubjects } from "../src/db/schema";
import { normalizeCourse, type RawCourse } from "../src/lib/normalizeCourse";

const CHUNK = 500;

type RawSubject = {
  code: string;
  nameEn: string;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Check .env.local");
    process.exit(1);
  }
  const file = resolve(__dirname, "data/courses.json");
  const subjectsFile = resolve(__dirname, "data/subjects.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as RawCourse[];
  // Keep ingestion compatible with an existing cached courses.json. The
  // scraper writes subjects.json on every new run, but older data directories
  // legitimately do not have it yet.
  const subjects = existsSync(subjectsFile)
    ? (JSON.parse(readFileSync(subjectsFile, "utf8")) as RawSubject[])
    : [];
  const rows = raw
    .map(normalizeCourse)
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => ({ ...c, units: String(c.units) }));
  console.log(
    `Ingesting ${rows.length}/${raw.length} courses (UG, with code)...`,
  );

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  const now = new Date();
  try {
    if (subjects.length) {
      await db
        .insert(courseSubjects)
        .values(
          subjects.map((subject) => ({
            code: subject.code.trim().toUpperCase(),
            nameEn: subject.nameEn.trim(),
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: courseSubjects.code,
          set: {
            nameEn: sql`excluded.name_en`,
            updatedAt: now,
          },
        });
    }
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(courses)
        .values(rows.slice(i, i + CHUNK).map((r) => ({ ...r, updatedAt: now })))
        .onConflictDoUpdate({
          target: courses.code,
          set: {
            subject: sql`excluded.subject`,
            title: sql`excluded.title`,
            units: sql`excluded.units`,
            description: sql`excluded.description`,
            terms: sql`excluded.terms`,
            requirementsRaw: sql`excluded.requirements_raw`,
            updatedAt: now,
          },
        });
    }
    console.log(
      `done: upserted ${subjects.length} subjects and ${rows.length} courses`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
