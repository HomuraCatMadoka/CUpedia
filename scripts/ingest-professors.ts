import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  courseEnrollments,
  professorCourses,
  professors,
} from "../src/db/schema";
import {
  buildProfessorCatalog,
  type TeachingStaffSource,
} from "./professor-catalog";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const file = resolve(process.cwd(), "scripts/data/professors.json");
  const source = JSON.parse(await readFile(file, "utf8")) as {
    capturedAt: string;
    professors: TeachingStaffSource[];
    enrollments: Array<{
      academicYear: string;
      term: string;
      courseCode: string;
      classCode: string;
      classNbr: string;
      component: string;
      section: string;
      quota: number;
      vacancy: number;
      instructors: string[];
    }>;
  };
  const catalog = buildProfessorCatalog(source.professors);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await db.transaction(async (tx) => {
    await tx.delete(professorCourses);
    await tx.delete(courseEnrollments);
    for (const professor of catalog) {
      await tx
        .insert(professors)
        .values(professor)
        .onConflictDoUpdate({
          target: professors.id,
          set: {
            name: professor.name,
            searchText: professor.searchText,
            updatedAt: new Date(),
          },
        });
      await tx
        .insert(professorCourses)
        .values(
          professor.courses.map((courseCode) => ({
            professorId: professor.id,
            courseCode,
          })),
        )
        .onConflictDoNothing();
    }
    for (let i = 0; i < source.enrollments.length; i += 500) {
      await tx.insert(courseEnrollments).values(
        source.enrollments.slice(i, i + 500).map((row) => ({
          ...row,
          capturedAt: new Date(source.capturedAt),
        })),
      );
    }
  });
  await pool.end();
  console.log(
    `Updated ${catalog.length} professors and ${source.enrollments.length} enrollment rows from ${file}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
