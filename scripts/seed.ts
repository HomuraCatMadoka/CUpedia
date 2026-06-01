import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { users, accounts, wikiPages, wikiRevisions } from "../src/db/schema";
import {
  USER_IDS,
  ACCOUNT_IDS,
  PAGE_IDS,
  REVISION_IDS,
  PASSWORD,
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

  const { pages, revisions } = await buildSeedData();
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
        createdBy: USER_IDS.admin,
        updatedBy: USER_IDS.admin,
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
        editedBy: USER_IDS.admin,
        editSummary: r.editSummary,
        createdAt: now,
      });
    }

    console.log(`  Created ${revisions.length} wiki revisions`);
  });

  await pool.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
