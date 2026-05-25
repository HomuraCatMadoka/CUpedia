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

// ── Fixed UUIDs ──

const USER_IDS = {
  admin: "00000000-0000-4000-a000-000000000001",
  user: "00000000-0000-4000-a000-000000000002",
  banned: "00000000-0000-4000-a000-000000000003",
} as const;

const ACCOUNT_IDS = {
  admin: "00000000-0000-4000-b000-000000000001",
  user: "00000000-0000-4000-b000-000000000002",
  banned: "00000000-0000-4000-b000-000000000003",
} as const;

const PAGE_IDS = {
  welcome: "00000000-0000-4000-c000-000000000001",
  gettingStarted: "00000000-0000-4000-c000-000000000002",
  campusLife: "00000000-0000-4000-c000-000000000003",
  dining: "00000000-0000-4000-c000-000000000004",
} as const;

const REVISION_IDS = {
  welcome: "00000000-0000-4000-d000-000000000001",
  gettingStarted: "00000000-0000-4000-d000-000000000002",
  campusLife: "00000000-0000-4000-d000-000000000003",
  dining: "00000000-0000-4000-d000-000000000004",
} as const;

// ── Seed data ──

const SEED_USERS = [
  {
    id: USER_IDS.admin,
    accountId: ACCOUNT_IDS.admin,
    email: "admin@test.com",
    nickname: "Admin",
    role: "admin",
    banned: false,
  },
  {
    id: USER_IDS.user,
    accountId: ACCOUNT_IDS.user,
    email: "user@test.com",
    nickname: "TestUser",
    role: "user",
    banned: false,
  },
  {
    id: USER_IDS.banned,
    accountId: ACCOUNT_IDS.banned,
    email: "banned@test.com",
    nickname: "Banned",
    role: "user",
    banned: true,
  },
] as const;

const PASSWORD = "password123";

const SEED_PAGES = [
  {
    id: PAGE_IDS.welcome,
    slug: "welcome",
    title: "Welcome to CUpedia",
    content:
      "# Welcome\n\nThis is the home page of CUpedia, your go-to wiki for CUHK students.",
    parentId: null,
    sortOrder: 0,
  },
  {
    id: PAGE_IDS.gettingStarted,
    slug: "getting-started",
    title: "Getting Started",
    content:
      "# Getting Started\n\nNew to CUHK? Here are some tips to help you settle in.\n\n## Registration\n\nVisit the [Registry](https://www.cuhk.edu.hk) for course registration.",
    parentId: null,
    sortOrder: 1,
  },
  {
    id: PAGE_IDS.campusLife,
    slug: "campus-life",
    title: "Campus Life",
    content:
      "# Campus Life\n\nCUHK offers a vibrant campus life with clubs, sports, and events.",
    parentId: null,
    sortOrder: 2,
  },
  {
    id: PAGE_IDS.dining,
    slug: "campus-life/dining",
    title: "Dining on Campus",
    content:
      "# Dining on Campus\n\nCUHK has many canteens across campus.\n\n## Popular Choices\n\n- United College Canteen\n- New Asia Canteen\n- Shaw College Canteen",
    parentId: PAGE_IDS.campusLife,
    sortOrder: 0,
  },
];

// ── Main ──

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Check .env.local");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log("Seeding database...");

  const hashedPassword = await hashPassword(PASSWORD);
  const now = new Date();

  await db.transaction(async (tx) => {
    // Clear existing seed data (reverse FK order)
    await tx.delete(wikiRevisions).where(
      sql`${wikiRevisions.id} IN (${sql.join(
        Object.values(REVISION_IDS).map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
    await tx.delete(wikiPages).where(
      sql`${wikiPages.id} IN (${sql.join(
        Object.values(PAGE_IDS).map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
    await tx.delete(accounts).where(
      sql`${accounts.id} IN (${sql.join(
        Object.values(ACCOUNT_IDS).map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
    await tx.delete(users).where(
      sql`${users.id} IN (${sql.join(
        Object.values(USER_IDS).map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );

    // Insert users
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

    // Insert wiki pages
    for (const p of SEED_PAGES) {
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

    console.log(`  Created ${SEED_PAGES.length} wiki pages`);

    // Insert revisions
    const revisionEntries = SEED_PAGES.map((p, i) => ({
      id: Object.values(REVISION_IDS)[i],
      pageId: p.id,
      title: p.title,
      content: p.content,
      editedBy: USER_IDS.admin,
      editSummary: "Initial page creation",
      createdAt: now,
    }));

    for (const r of revisionEntries) {
      await tx.insert(wikiRevisions).values(r);
    }

    console.log(`  Created ${revisionEntries.length} wiki revisions`);
  });

  await pool.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
