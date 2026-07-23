import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import { wikiPages, wikiRevisions } from "../src/db/schema";
import { fromMarkdown } from "../src/lib/plate-utils";

const LATEX_RE = /\$[^$]+\$/;
const METADATA_RE = /^(Owner|Verification|Tags):\s*.+$/m;

function isPlateJson(content: string): boolean {
  if (!content.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && parsed.length > 0 && "type" in parsed[0];
  } catch {
    return false;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log(dryRun ? "=== DRY RUN ===" : "=== MIGRATING ===");

  const pages = await db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      content: wikiPages.content,
    })
    .from(wikiPages);

  const revisions = await db
    .select({ id: wikiRevisions.id, content: wikiRevisions.content })
    .from(wikiRevisions);

  let converted = 0;
  let skipped = 0;
  const latex: string[] = [];
  const metadata: string[] = [];
  const errors: { id: string; error: string }[] = [];

  // Migrate wikiPages
  for (const page of pages) {
    if (isPlateJson(page.content)) {
      skipped++;
      continue;
    }
    if (LATEX_RE.test(page.content)) latex.push(`page:${page.slug}`);
    if (METADATA_RE.test(page.content)) metadata.push(`page:${page.slug}`);

    try {
      const json = await fromMarkdown(page.content);
      if (!dryRun) {
        await db
          .update(wikiPages)
          .set({
            content: json,
            version: sql`${wikiPages.version} + 1`,
          })
          .where(eq(wikiPages.id, page.id));
      }
      converted++;
    } catch (e) {
      errors.push({ id: `page:${page.slug}`, error: String(e) });
    }
  }

  // Migrate wikiRevisions
  for (const rev of revisions) {
    if (isPlateJson(rev.content)) {
      skipped++;
      continue;
    }
    if (LATEX_RE.test(rev.content)) latex.push(`rev:${rev.id}`);

    try {
      const json = await fromMarkdown(rev.content);
      if (!dryRun) {
        await db
          .update(wikiRevisions)
          .set({ content: json })
          .where(eq(wikiRevisions.id, rev.id));
      }
      converted++;
    } catch (e) {
      errors.push({ id: `rev:${rev.id}`, error: String(e) });
    }
  }

  console.log(`\nTotal pages: ${pages.length}, revisions: ${revisions.length}`);
  console.log(`Converted: ${converted}, Skipped (already JSON): ${skipped}`);
  if (latex.length) console.log(`LaTeX detected: ${latex.join(", ")}`);
  if (metadata.length) console.log(`Notion metadata: ${metadata.join(", ")}`);
  if (errors.length) {
    console.log(`Errors:`);
    for (const e of errors) console.log(`  ${e.id}: ${e.error}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
