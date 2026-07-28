import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { wikiLinks, wikiPages } from "../src/db/schema";
import { buildWikiLinkRows } from "../src/lib/wiki-links";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

type LinkRow = { sourceId: string; targetId: string };

function rowKey(row: LinkRow) {
  return `${row.sourceId}:${row.targetId}`;
}

function difference(left: LinkRow[], right: LinkRow[]) {
  const rightKeys = new Set(right.map(rowKey));
  return left.filter((row) => !rightKeys.has(rowKey(row)));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const repair = process.argv.includes("--repair");
  const pool = new Pool({ connectionString: url });
  const database = drizzle(pool);

  try {
    await database.transaction(
      async (tx) => {
        if (repair) {
          await tx.execute(
            sql`lock table ${wikiPages}, ${wikiLinks} in share mode`,
          );
        }

        const pages = await tx
          .select({ id: wikiPages.id, content: wikiPages.content })
          .from(wikiPages);
        const expected = buildWikiLinkRows(pages);
        let actual = await tx
          .select({
            sourceId: wikiLinks.sourceId,
            targetId: wikiLinks.targetId,
          })
          .from(wikiLinks);

        const missing = difference(expected, actual);
        const extra = difference(actual, expected);
        const inconsistent =
          missing.length > 0 ||
          extra.length > 0 ||
          expected.length !== actual.length;

        if (repair && inconsistent) {
          await tx.delete(wikiLinks);
          for (let offset = 0; offset < expected.length; offset += 5_000) {
            await tx
              .insert(wikiLinks)
              .values(expected.slice(offset, offset + 5_000));
          }
          actual = await tx
            .select({
              sourceId: wikiLinks.sourceId,
              targetId: wikiLinks.targetId,
            })
            .from(wikiLinks);
        }

        const remainingMissing = difference(expected, actual);
        const remainingExtra = difference(actual, expected);
        console.log(
          `wiki_links expected=${expected.length} actual=${actual.length} missing=${remainingMissing.length} extra=${remainingExtra.length}`,
        );
        if (
          remainingMissing.length ||
          remainingExtra.length ||
          expected.length !== actual.length
        ) {
          process.exitCode = 1;
        }
      },
      {
        isolationLevel: "repeatable read",
        accessMode: repair ? "read write" : "read only",
      },
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
