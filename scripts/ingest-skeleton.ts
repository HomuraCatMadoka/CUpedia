// 摄取主修骨架：scripts/data/handbook/*.html → parseHandbookLeaf → majors/categories/courses 三表。
// HTML 由 tools/scraper/scrape_handbook.py 产出。成员课号先过 courseAliases 重映射；
// 在 courses 表缺失者按 ADR 0005 决议标 missing=true（占位 + 告警，不静默隐藏）。幂等。
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, sql } from "drizzle-orm";
import {
  majors,
  majorCategories,
  categoryCourses,
  courseAliases,
  courses,
} from "../src/db/schema";
import { parseHandbookLeaf } from "../src/lib/parseHandbookLeaf";
import { COURSE_ALIASES } from "./course-aliases-seed";

function handbookYear(html: string): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const m = text.match(/admitted in\s*(20\s*\d\s*\d\s*-?\s*\d\s*\d)/i);
  return m ? m[1].replace(/\s+/g, "") : "unknown";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Check .env.local");
    process.exit(1);
  }
  const dir = resolve(__dirname, "data/handbook");
  const files = readdirSync(dir).filter((f) => f.endsWith(".html"));
  console.log(`Ingesting ${files.length} handbook leaves...`);

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  try {
    // 幂等灌入版本对齐别名种子（scripts/course-aliases-seed.ts），再读回作重映射
    if (COURSE_ALIASES.length) {
      await db
        .insert(courseAliases)
        .values(COURSE_ALIASES)
        .onConflictDoUpdate({
          target: courseAliases.oldCode,
          set: { newCode: sql`excluded.new_code` },
        });
    }
    const aliasRows = await db.select().from(courseAliases);
    const alias = new Map(aliasRows.map((a) => [a.oldCode, a.newCode]));
    const known = new Set(
      (await db.select({ code: courses.code }).from(courses)).map(
        (c) => c.code,
      ),
    );

    let missingCount = 0;
    for (const file of files) {
      const html = readFileSync(resolve(dir, file), "utf8");
      const leaf = parseHandbookLeaf(html);
      const year = handbookYear(html);

      await db.transaction(async (tx) => {
        await tx
          .delete(majors)
          .where(
            and(eq(majors.name, leaf.title), eq(majors.handbookYear, year)),
          );
        const [major] = await tx
          .insert(majors)
          .values({
            name: leaf.title,
            totalUnits:
              leaf.totalUnits != null ? String(leaf.totalUnits) : null,
            handbookYear: year,
          })
          .returning({ id: majors.id });

        for (const cat of leaf.categories) {
          const [row] = await tx
            .insert(majorCategories)
            .values({
              majorId: major.id,
              name: cat.name,
              kind: cat.kind,
              unitsRequired:
                cat.unitsRequired != null ? String(cat.unitsRequired) : null,
              pickN: cat.pickN,
            })
            .returning({ id: majorCategories.id });

          const members = cat.members.map((code) => {
            const mapped = alias.get(code) ?? code;
            const missing = !known.has(mapped);
            if (missing) {
              missingCount++;
              console.warn(
                `  ⚠ ${leaf.title} / ${cat.name}: ${mapped} not in courses (placeholder)`,
              );
            }
            return { categoryId: row.id, courseCode: mapped, missing };
          });
          if (members.length) await tx.insert(categoryCourses).values(members);
        }
      });
      console.log(
        `  ${file}: "${leaf.title}" (${year}) — ${leaf.categories.length} categories`,
      );
    }
    console.log(
      `done: ${files.length} leaves, ${missingCount} placeholder members`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
