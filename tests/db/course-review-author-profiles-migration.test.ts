import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.MIGRATION_COMPATIBILITY_TEST === "1" && !databaseUrl) {
  throw new Error(
    "DATABASE_URL is required when MIGRATION_COMPATIBILITY_TEST=1",
  );
}

it.skipIf(!databaseUrl)(
  "backfills public review authors exactly once and preserves existing showcases",
  async () => {
    const migration = await readFile(
      "src/db/migrations/0132_course_review_author_profiles.sql",
      "utf8",
    );
    const publicAuthor = "00000000-0000-4000-8000-000000000001";
    const anonymousAuthor = "00000000-0000-4000-8000-000000000002";
    const existingAuthor = "00000000-0000-4000-8000-000000000003";
    const existingShowcase = "00000000-0000-4000-8000-000000000004";
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query("begin");
      // The migration uses unqualified names, which resolve to these session-local tables.
      await client.query(`
        create temporary table course_reviews (
          user_id uuid not null,
          is_anonymous boolean not null
        );
        create temporary table achievement_profiles (
          user_id uuid primary key,
          showcase_id uuid unique not null default gen_random_uuid()
        );
      `);
      await client.query(
        `insert into course_reviews (user_id, is_anonymous)
         values ($1, false), ($1, false), ($2, true), ($3, false)`,
        [publicAuthor, anonymousAuthor, existingAuthor],
      );
      await client.query(
        "insert into achievement_profiles (user_id, showcase_id) values ($1, $2)",
        [existingAuthor, existingShowcase],
      );

      const selectProfiles =
        "select user_id, showcase_id from achievement_profiles order by user_id";
      await client.query(migration);
      const first = await client.query(selectProfiles);
      expect(first.rows).toEqual([
        { user_id: publicAuthor, showcase_id: expect.any(String) },
        { user_id: existingAuthor, showcase_id: existingShowcase },
      ]);

      await client.query(migration);
      expect((await client.query(selectProfiles)).rows).toEqual(first.rows);
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);
