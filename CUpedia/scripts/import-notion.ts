import "dotenv/config";
import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { wikiPages, wikiRevisions } from "../src/db/schema";
import { generateSlug, validateSlug } from "../src/lib/slug";
import {
  stripMetadata,
  convertLinks,
  processImages,
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
  while ((match = linkRe.exec(content)) !== null) {
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

function makeImportSlug(
  title: string,
  parentSlug: string | undefined,
  usedSlugs: Set<string>,
): string {
  const basePart = generateSlug(title) || "untitled";
  const base = parentSlug ? `${parentSlug}/${basePart}` : basePart;
  let candidate = base;
  let i = 2;

  while (!validateSlug(candidate) || usedSlugs.has(candidate)) {
    candidate = `${base}-${i}`;
    i += 1;
  }

  usedSlugs.add(candidate);
  return candidate;
}

interface ImportEntry {
  title: string;
  slug: string;
  content: string;
  fileDir: string;
  relativeDir: string;
  children: ImportEntry[];
}

function scanDir(
  dir: string,
  exportRoot: string,
  pathToSlug: Map<string, string>,
  parentSlug?: string,
  usedSlugs = new Set<string>(),
): ImportEntry[] {
  const entries: ImportEntry[] = [];
  const items = fs.readdirSync(dir);
  const scannedDirs = new Set<string>();

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isFile() && item.endsWith(".md")) {
      const { title } = parseNotionFilename(item);
      const slug = makeImportSlug(title, parentSlug, usedSlugs);
      const content = fs.readFileSync(fullPath, "utf-8");

      const relPath = path
        .relative(exportRoot, fullPath)
        .split(path.sep)
        .join("/");
      pathToSlug.set(relPath, slug);

      const children: ImportEntry[] = [];
      const subDir = path.join(dir, title);
      if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
        scannedDirs.add(title);
        children.push(
          ...scanDir(subDir, exportRoot, pathToSlug, slug, usedSlugs),
        );
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
        title,
        slug,
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

    const orphaned = scanDir(
      fullPath,
      exportRoot,
      pathToSlug,
      parentSlug,
      usedSlugs,
    );
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
  pathToSlug: Map<string, string>,
  uploadFn: (
    buffer: Buffer,
    filename: string,
    contentType: string,
  ) => Promise<{ key: string; url: string }>,
): Promise<void> {
  let content = entry.content;
  content = stripMetadata(content);
  content = convertLinks(content, entry.relativeDir, pathToSlug);
  content = await processImages(content, entry.fileDir, exportRoot, uploadFn);
  entry.content = content;

  for (const child of entry.children) {
    await processEntry(child, exportRoot, pathToSlug, uploadFn);
  }
}

async function insertEntries(
  db: ReturnType<typeof drizzle>,
  adminUserId: string,
  entries: ImportEntry[],
  parentId: string | null,
) {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const [page] = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(wikiPages)
        .values({
          slug: entry.slug,
          title: entry.title,
          content: entry.content,
          parentId,
          sortOrder: i,
          createdBy: adminUserId,
          updatedBy: adminUserId,
        })
        .returning();

      await tx.insert(wikiRevisions).values({
        pageId: inserted.id,
        title: entry.title,
        content: entry.content,
        editedBy: adminUserId,
        editSummary: "导入 Notion 页面",
      });

      return [inserted];
    });

    console.log(`Imported: ${entry.slug}`);

    if (entry.children.length > 0) {
      await insertEntries(db, adminUserId, entry.children, page.id);
    }
  }
}

function createUploader() {
  const s3 = new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
  const bucket = process.env.MINIO_BUCKET!;
  const uploadedKeys: string[] = [];

  async function upload(buffer: Buffer, filename: string, contentType: string) {
    const ext = filename.split(".").pop();
    const key = `wiki-assets/${randomUUID()}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    uploadedKeys.push(key);
    return { key, url: `/api/wiki-assets/${key}` };
  }

  async function rollback() {
    if (uploadedKeys.length === 0) return;
    console.log(`Rolling back ${uploadedKeys.length} uploaded objects...`);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: uploadedKeys.map((Key) => ({ Key })) },
      }),
    );
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

  const existingPages = await db
    .select({ slug: wikiPages.slug })
    .from(wikiPages);
  const usedSlugs = new Set(existingPages.map((page) => page.slug));

  console.log(`Scanning ${exportRoot}...`);
  const pathToSlug = new Map<string, string>();
  let entries = scanDir(
    exportRoot,
    exportRoot,
    pathToSlug,
    undefined,
    usedSlugs,
  );
  console.log(
    `Found ${entries.length} top-level pages, ${pathToSlug.size} total pages`,
  );

  // Unwrap single root: promote its children to top-level
  if (entries.length === 1 && entries[0].children.length > 0) {
    const root = entries[0];
    const prefix = `${root.slug}/`;
    console.log(
      `Unwrapping single root: "${root.title}" (${root.children.length} children)`,
    );

    function stripPrefix(entry: ImportEntry) {
      if (entry.slug.startsWith(prefix)) {
        entry.slug = entry.slug.slice(prefix.length);
      }
      entry.content = entry.content.replaceAll(`/wiki/${prefix}`, "/wiki/");
      for (const child of entry.children) stripPrefix(child);
    }
    for (const child of root.children) stripPrefix(child);

    // Update pathToSlug to reflect stripped slugs
    for (const [key, val] of pathToSlug) {
      if (val.startsWith(prefix)) {
        pathToSlug.set(key, val.slice(prefix.length));
      }
    }

    entries = root.children;
  }

  const { upload, rollback } = createUploader();

  try {
    console.log("Processing content (metadata, images, links)...");
    for (const entry of entries) {
      await processEntry(entry, exportRoot, pathToSlug, upload);
    }

    console.log("Inserting into database...");
    await insertEntries(db, adminUserId, entries, null);
    console.log("Import complete.");
  } catch (err) {
    console.error("Import failed, rolling back uploads...", err);
    await rollback();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
