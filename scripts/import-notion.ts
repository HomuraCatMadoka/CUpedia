import "dotenv/config";
import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import { wikiPages, wikiRevisions } from "../src/db/schema";
import { deleteObjects, uploadAsset } from "../src/lib/minio";
import {
  stripMetadata,
  convertLinks,
  processImages,
  encodeNotionLinkParens,
} from "./import-notion-transforms";

export function parseNotionFilename(filename: string): {
  title: string;
  uuid: string;
} {
  const match = filename.match(/^(.+)\s+([a-f0-9]{32})\.md$/);
  if (!match) return { title: filename.replace(/\.md$/, ""), uuid: "" };
  return { title: match[1], uuid: match[2] };
}

export function extractLinkOrder(content: string): string[] {
  const linkRe = /\]\(([^)]+\.md)\)/g;
  const titles: string[] = [];
  let match;
  // Normalize stray parens first so mixed full-/half-width titles still match.
  const normalized = encodeNotionLinkParens(content);
  while ((match = linkRe.exec(normalized)) !== null) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(match[1]);
    } catch {
      continue;
    }
    const { title } = parseNotionFilename(path.basename(decoded));
    if (title && !titles.includes(title)) {
      titles.push(title);
    }
  }
  return titles;
}

export function notionIdToUuid(value: string): string {
  if (!/^[a-f0-9]{32}$/i.test(value)) return randomUUID();
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}

export function rewriteDroppedRootLinks(
  content: string,
  droppedRootPageId: string,
): string {
  return content.replaceAll(`/wiki/${droppedRootPageId}`, "/wiki");
}

interface ImportEntry {
  id: string;
  title: string;
  content: string;
  fileDir: string;
  relativeDir: string;
  children: ImportEntry[];
}

function scanDir(
  dir: string,
  exportRoot: string,
  pathToPageId: Map<string, string>,
): ImportEntry[] {
  const entries: ImportEntry[] = [];
  const items = fs.readdirSync(dir);
  const scannedDirs = new Set<string>();

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isFile() && item.endsWith(".md")) {
      const { title, uuid } = parseNotionFilename(item);
      const id = notionIdToUuid(uuid);
      const content = fs.readFileSync(fullPath, "utf-8");

      const relPath = path
        .relative(exportRoot, fullPath)
        .split(path.sep)
        .join("/");
      pathToPageId.set(relPath, id);

      const children: ImportEntry[] = [];
      const subDir = path.join(dir, title);
      if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
        scannedDirs.add(title);
        children.push(...scanDir(subDir, exportRoot, pathToPageId));
      }

      if (children.length > 1) {
        const linkOrder = extractLinkOrder(content);
        if (linkOrder.length > 0) {
          const orderMap = new Map(linkOrder.map((t, i) => [t, i]));
          children.sort((a, b) => {
            const ai = orderMap.get(a.title) ?? Infinity;
            const bi = orderMap.get(b.title) ?? Infinity;
            return ai - bi;
          });
        }
      }

      entries.push({
        id,
        title,
        content,
        fileDir: dir,
        relativeDir: path.relative(exportRoot, dir),
        children,
      });
    }
  }

  // Scan orphan directories (Notion database views exported as CSV + subdirectory)
  for (const item of items) {
    if (scannedDirs.has(item)) continue;
    const fullPath = path.join(dir, item);
    try {
      if (!fs.statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }
    if (item === ".DS_Store") continue;

    const orphaned = scanDir(fullPath, exportRoot, pathToPageId);
    if (orphaned.length > 0) {
      console.log(
        `Recovered ${orphaned.length} pages from orphan directory: ${path.relative(exportRoot, fullPath)}`,
      );
      entries.push(...orphaned);
    }
  }

  return entries;
}

async function processEntry(
  entry: ImportEntry,
  exportRoot: string,
  pathToPageId: Map<string, string>,
  uploadFn: (
    buffer: Buffer,
    filename: string,
    contentType: string,
  ) => Promise<{ key: string; url: string }>,
  droppedRootPageId?: string,
): Promise<void> {
  let content = entry.content;
  content = stripMetadata(content);
  content = convertLinks(content, entry.relativeDir, pathToPageId);
  if (droppedRootPageId) {
    content = rewriteDroppedRootLinks(content, droppedRootPageId);
  }
  content = await processImages(content, entry.fileDir, exportRoot, uploadFn);
  entry.content = content;

  for (const child of entry.children) {
    await processEntry(
      child,
      exportRoot,
      pathToPageId,
      uploadFn,
      droppedRootPageId,
    );
  }
}

type ImportTransaction = Parameters<
  Parameters<ReturnType<typeof drizzle>["transaction"]>[0]
>[0];

async function insertEntries(
  db: ImportTransaction,
  adminUserId: string,
  entries: ImportEntry[],
  parentId: string | null,
) {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const [page] = await db
      .insert(wikiPages)
      .values({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        parentId,
        sortOrder: i,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      })
      .returning();

    await db.insert(wikiRevisions).values({
      pageId: page.id,
      title: entry.title,
      content: entry.content,
      editedBy: adminUserId,
      editSummary: "导入 Notion 页面",
    });

    console.log(`Importing: ${entry.id}`);

    if (entry.children.length > 0) {
      await insertEntries(db, adminUserId, entry.children, page.id);
    }
  }
}

function createUploader() {
  const uploadedKeys: string[] = [];

  async function upload(buffer: Buffer, filename: string, contentType: string) {
    const { key, url } = await uploadAsset(buffer, filename, contentType);
    uploadedKeys.push(key);
    return { key, url };
  }

  async function rollback() {
    if (uploadedKeys.length === 0) return;
    console.log(`Rolling back ${uploadedKeys.length} uploaded objects...`);
    await deleteObjects(uploadedKeys);
  }

  return { upload, rollback, uploadedKeys };
}

async function checkSchema(db: ReturnType<typeof drizzle>) {
  const result = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'wiki_pages'
  `);
  if (result.rows.length === 0) {
    console.error(
      "ERROR: wiki_pages table does not exist.\n" +
        "Run migrations first: pnpm drizzle-kit migrate",
    );
    process.exit(1);
  }
}

export async function revalidateWikiCache() {
  const url = process.env.WIKI_REVALIDATE_URL;
  const secret = process.env.WIKI_REVALIDATE_SECRET;
  if (!url && !secret) {
    console.warn(
      "Wiki cache revalidation skipped: WIKI_REVALIDATE_URL and WIKI_REVALIDATE_SECRET are not set",
    );
    return false;
  }
  if (!url || !secret) {
    throw new Error(
      "WIKI_REVALIDATE_URL and WIKI_REVALIDATE_SECRET must be set together",
    );
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!response.ok) {
    throw new Error(`Wiki cache revalidation failed: HTTP ${response.status}`);
  }
  return true;
}

async function main() {
  const notionDir = process.argv[2];
  if (!notionDir) {
    console.error(
      "Usage: npx tsx scripts/import-notion.ts <notion-export-dir>",
    );
    process.exit(1);
  }

  const adminUserId = process.env.ADMIN_USER_ID;
  if (!adminUserId) {
    console.error("ADMIN_USER_ID is required");
    process.exit(1);
  }

  const exportRoot = path.resolve(notionDir);
  if (!fs.existsSync(exportRoot) || !fs.statSync(exportRoot).isDirectory()) {
    console.error(`Not a directory: ${exportRoot}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  await checkSchema(db);

  console.log(`Scanning ${exportRoot}...`);
  const pathToPageId = new Map<string, string>();
  let entries = scanDir(exportRoot, exportRoot, pathToPageId);
  console.log(
    `Found ${entries.length} top-level pages, ${pathToPageId.size} total pages`,
  );

  let droppedRootPageId: string | undefined;

  // Unwrap single root: promote its children to top-level
  if (entries.length === 1 && entries[0].children.length > 0) {
    const root = entries[0];
    console.log(
      `Unwrapping single root: "${root.title}" (${root.children.length} children)`,
    );
    droppedRootPageId = root.id;
    entries = root.children;
  }

  const { upload, rollback } = createUploader();

  try {
    console.log("Processing content (metadata, images, links)...");
    for (const entry of entries) {
      await processEntry(
        entry,
        exportRoot,
        pathToPageId,
        upload,
        droppedRootPageId,
      );
    }

    console.log("Inserting into database...");
    await db.transaction((tx) => insertEntries(tx, adminUserId, entries, null));
    console.log("Import complete.");
  } catch (err) {
    console.error("Import failed, rolling back uploads...", err);
    await rollback();
    process.exit(1);
  } finally {
    await pool.end();
  }

  if (await revalidateWikiCache()) {
    console.log("Wiki cache revalidated.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
