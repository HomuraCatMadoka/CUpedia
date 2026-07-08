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
  courseAggregates,
  courseReviews,
  courses,
  wikiPages,
  wikiRevisions,
  siteSettings,
} from "../src/db/schema";
import {
  USER_IDS,
  ACCOUNT_IDS,
  COURSE_IDS,
  PAGE_IDS,
  REVISION_IDS,
  PASSWORD,
  SEED_COURSES,
  SEED_COURSE_REVIEWS,
  SEED_USERS,
  buildSeedData,
} from "./seed-data";

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
      .delete(courses)
      .where(sql`${courses.id} IN (${uuidIn(Object.values(COURSE_IDS))})`);
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

    for (const course of SEED_COURSES) {
      await tx.insert(courses).values({
        ...course,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(`  Created ${SEED_COURSES.length} courses`);

    for (const review of SEED_COURSE_REVIEWS) {
      await tx.insert(courseReviews).values({
        ...review,
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const course of SEED_COURSES) {
      const reviewsForCourse = SEED_COURSE_REVIEWS.filter(
        (review) => review.courseId === course.id,
      );
      await tx.insert(courseAggregates).values({
        courseId: course.id,
        reviewCount: reviewsForCourse.length,
        ratingSum: reviewsForCourse.reduce(
          (sum, review) => sum + review.rating,
          0,
        ),
        difficultySum: reviewsForCourse.reduce(
          (sum, review) => sum + review.difficulty,
          0,
        ),
        workloadSum: reviewsForCourse.reduce(
          (sum, review) => sum + review.workload,
          0,
        ),
        gradingSum: reviewsForCourse.reduce(
          (sum, review) => sum + review.grading,
          0,
        ),
        updatedAt: now,
      });
    }

    console.log(`  Created ${SEED_COURSE_REVIEWS.length} course reviews`);

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
  });

  await pool.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
