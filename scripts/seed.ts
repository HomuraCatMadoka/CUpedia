import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import {
  users,
  accounts,
  wikiPages,
  wikiRevisions,
  siteSettings,
  courses,
  majors,
  majorCategories,
  categoryCourses,
  professors,
  professorCourses,
} from "../src/db/schema";
import {
  USER_IDS,
  ACCOUNT_IDS,
  PAGE_IDS,
  REVISION_IDS,
  PASSWORD,
  SEED_USERS,
  SEED_PROFESSOR,
  buildSeedData,
} from "./seed-data";
import {
  COURSE_SEED_MAJOR_IDS,
  SEED_COURSES,
  SEED_MAJORS,
} from "./course-tree-seed";

function uuidIn(ids: readonly string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Check .env.local");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log("Seeding database...");

  const { pages, revisions, siteSettings: settings } = await buildSeedData();
  const hashedPassword = await hashPassword(PASSWORD);
  const now = new Date();

  await db.transaction(async (tx) => {
    // Clear existing seed rows (reverse FK order) so the script is idempotent.
    await tx
      .delete(wikiRevisions)
      .where(
        sql`${wikiRevisions.id} IN (${uuidIn(Object.values(REVISION_IDS))})`,
      );
    await tx
      .delete(wikiPages)
      .where(sql`${wikiPages.id} IN (${uuidIn(Object.values(PAGE_IDS))})`);
    await tx
      .delete(accounts)
      .where(sql`${accounts.id} IN (${uuidIn(Object.values(ACCOUNT_IDS))})`);
    await tx
      .delete(users)
      .where(sql`${users.id} IN (${uuidIn(Object.values(USER_IDS))})`);

    for (const u of SEED_USERS) {
      await tx.insert(users).values({
        id: u.id,
        name: u.nickname,
        email: u.email,
        emailVerified: true,
        image: u.image ?? null,
        nickname: u.nickname,
        role: u.role,
        banned: u.banned,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(accounts).values({
        id: u.accountId,
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(`  Created ${SEED_USERS.length} users`);

    for (const p of pages) {
      await tx.insert(wikiPages).values({
        id: p.id,
        slug: p.slug,
        title: p.title,
        content: p.content,
        parentId: p.parentId,
        sortOrder: p.sortOrder,
        deletedAt: p.deletedAt,
        createdBy: p.createdBy,
        updatedBy: p.updatedBy,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(`  Created ${pages.length} wiki pages`);

    for (const r of revisions) {
      await tx.insert(wikiRevisions).values({
        id: r.id,
        pageId: r.pageId,
        title: r.title,
        content: r.content,
        editedBy: r.editedBy,
        editSummary: r.editSummary,
        createdAt: now,
      });
    }

    console.log(`  Created ${revisions.length} wiki revisions`);

    for (const s of settings) {
      await tx
        .insert(siteSettings)
        .values({ key: s.key, value: s.value })
        .onConflictDoUpdate({
          target: siteSettings.key,
          set: { value: s.value },
        });
    }

    console.log(`  Seeded ${settings.length} site settings`);

    // ── 课程技能树种子(#163)──
    // 先删两个种子主修(cascade 清 categories + categoryCourses),课程 upsert;
    // 全量 4828 门只在 prod,本地/CI 只需这份最小确定性数据。
    await tx
      .delete(majors)
      .where(
        sql`${majors.id} IN (${uuidIn(Object.values(COURSE_SEED_MAJOR_IDS))})`,
      );

    for (const c of SEED_COURSES) {
      await tx
        .insert(courses)
        .values({
          code: c.code,
          subject: c.subject,
          title: c.title,
          units: c.units,
          terms: c.terms,
          description: c.description,
          requirementsRaw: c.requirementsRaw ?? "",
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: courses.code,
          set: {
            subject: c.subject,
            title: c.title,
            units: c.units,
            terms: c.terms,
            description: c.description,
            requirementsRaw: c.requirementsRaw ?? "",
            updatedAt: now,
          },
        });
    }

    await tx
      .insert(professors)
      .values({
        id: SEED_PROFESSOR.id,
        name: SEED_PROFESSOR.name,
        searchText: SEED_PROFESSOR.searchText,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: professors.id,
        set: {
          name: SEED_PROFESSOR.name,
          searchText: SEED_PROFESSOR.searchText,
          updatedAt: now,
        },
      });
    await tx
      .insert(professorCourses)
      .values(
        SEED_PROFESSOR.courseCodes.map((courseCode) => ({
          professorId: SEED_PROFESSOR.id,
          courseCode,
        })),
      )
      .onConflictDoNothing();

    for (const m of SEED_MAJORS) {
      await tx.insert(majors).values({
        id: m.id,
        name: m.name,
        faculty: m.faculty,
        totalUnits: m.totalUnits,
        normativeYears: m.normativeYears,
        handbookYear: m.handbookYear,
        createdAt: now,
        updatedAt: now,
      });

      for (const cat of m.categories) {
        await tx.insert(majorCategories).values({
          id: cat.id,
          majorId: m.id,
          name: cat.name,
          kind: cat.kind,
          unitsRequired: cat.unitsRequired,
          pickN: cat.pickN,
        });
        await tx.insert(categoryCourses).values(
          cat.members.map((mem) => ({
            categoryId: cat.id,
            courseCode: mem.code,
            missing: mem.missing ?? false,
          })),
        );
      }
    }

    console.log(
      `  Seeded ${SEED_COURSES.length} courses, ${SEED_MAJORS.length} major skeletons`,
    );
  });

  await pool.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
