"use server";

import { db } from "@/db";
import { wikiPages, wikiRevisions } from "@/db/schema";
import { eq, isNull, and, sql, desc, inArray } from "drizzle-orm";
import { unstable_cache, revalidateTag } from "next/cache";
import { requireAdmin, requireEditor } from "@/lib/auth-guard";
import { validateSlug } from "@/lib/slug";
import { searchPages } from "@/lib/search";
import { extractText } from "@/lib/plate-utils";

const getCachedWikiPage = unstable_cache(
  async (slug: string) => {
    const page = await db.query.wikiPages.findFirst({
      where: and(eq(wikiPages.slug, slug), isNull(wikiPages.deletedAt)),
      with: {
        createdByUser: { columns: { nickname: true } },
        updatedByUser: { columns: { nickname: true } },
      },
    });
    return page ?? null;
  },
  ["wiki-page"],
  { tags: ["wiki-pages"] },
);

export async function getWikiPage(slug: string) {
  return getCachedWikiPage(slug);
}

const getCachedWikiTree = unstable_cache(
  async () => {
    const pages = await db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        parentId: wikiPages.parentId,
        sortOrder: wikiPages.sortOrder,
      })
      .from(wikiPages)
      .where(isNull(wikiPages.deletedAt))
      .orderBy(wikiPages.sortOrder);
    return pages;
  },
  ["wiki-tree"],
  { tags: ["wiki-pages"] },
);

export async function getWikiTree() {
  return getCachedWikiTree();
}

export async function createWikiPage(data: {
  slug: string;
  title: string;
  content: string;
  parentId?: string | null;
}) {
  const user = await requireEditor();
  if (!validateSlug(data.slug)) throw new Error("Invalid slug");

  const page = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(wikiPages)
      .values({
        slug: data.slug,
        title: data.title,
        content: data.content,
        parentId: data.parentId ?? null,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();

    await tx.insert(wikiRevisions).values({
      pageId: p.id,
      title: data.title,
      content: data.content,
      editedBy: user.id,
      editSummary: "创建页面",
    });

    return p;
  });

  revalidateTag("wiki-pages", "max");
  return page;
}

export async function updateWikiPage(data: {
  slug: string;
  title: string;
  content: string;
  editSummary?: string;
  expectedUpdatedAt: string;
}) {
  const user = await requireEditor();

  const existing = await db.query.wikiPages.findFirst({
    where: eq(wikiPages.slug, data.slug),
  });
  if (!existing) throw new Error("Page not found");

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(wikiPages)
      .set({
        title: data.title,
        content: data.content,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wikiPages.id, existing.id),
          eq(wikiPages.updatedAt, new Date(data.expectedUpdatedAt)),
        ),
      )
      .returning();

    if (updated.length === 0) throw new Error("EDIT_CONFLICT");

    await tx.insert(wikiRevisions).values({
      pageId: existing.id,
      title: data.title,
      content: data.content,
      editedBy: user.id,
      editSummary: data.editSummary ?? null,
    });

    return updated[0];
  });

  revalidateTag("wiki-pages", "max");
  return result;
}

export async function deleteWikiPage(pageId: string) {
  await requireAdmin();
  const now = new Date();

  const descendantResult = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM wiki_pages WHERE id = ${pageId}
      UNION ALL
      SELECT wp.id FROM wiki_pages wp JOIN tree t ON wp.parent_id = t.id
    )
    SELECT id FROM tree
  `);

  const ids = (
    (descendantResult.rows ?? descendantResult) as { id: string }[]
  ).map((r) => r.id);
  if (ids.length === 0) return;

  await db
    .update(wikiPages)
    .set({ deletedAt: now })
    .where(inArray(wikiPages.id, ids));

  revalidateTag("wiki-pages", "max");
}

export async function restoreWikiPage(pageId: string) {
  await requireAdmin();

  const relatedResult = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM wiki_pages WHERE id = ${pageId}
      UNION ALL
      SELECT wp.id, wp.parent_id FROM wiki_pages wp JOIN ancestors a ON a.parent_id = wp.id
    ),
    descendants AS (
      SELECT id FROM wiki_pages WHERE id = ${pageId}
      UNION ALL
      SELECT wp.id FROM wiki_pages wp JOIN descendants d ON wp.parent_id = d.id
    )
    SELECT id FROM ancestors
    UNION
    SELECT id FROM descendants
  `);

  const ids = ((relatedResult.rows ?? relatedResult) as { id: string }[]).map(
    (r) => r.id,
  );
  if (ids.length === 0) return;

  await db
    .update(wikiPages)
    .set({ deletedAt: null })
    .where(inArray(wikiPages.id, ids));

  revalidateTag("wiki-pages", "max");
}

export async function getRevisions(pageId: string) {
  return db.query.wikiRevisions.findMany({
    where: eq(wikiRevisions.pageId, pageId),
    orderBy: [desc(wikiRevisions.createdAt)],
    with: {
      editedByUser: { columns: { nickname: true } },
    },
  });
}

export async function getRevision(pageId: string, revisionId: string) {
  return db.query.wikiRevisions.findFirst({
    where: and(
      eq(wikiRevisions.id, revisionId),
      eq(wikiRevisions.pageId, pageId),
    ),
  });
}

export async function rollbackToRevision(pageId: string, revisionId: string) {
  const user = await requireEditor();
  const revision = await getRevision(pageId, revisionId);
  if (!revision) throw new Error("Revision not found");

  const existing = await db.query.wikiPages.findFirst({
    where: eq(wikiPages.id, pageId),
  });
  if (!existing) throw new Error("Page not found");

  await db.transaction(async (tx) => {
    await tx
      .update(wikiPages)
      .set({
        title: revision.title,
        content: revision.content,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(wikiPages.id, pageId));

    await tx.insert(wikiRevisions).values({
      pageId,
      title: revision.title,
      content: revision.content,
      editedBy: user.id,
      editSummary: `回滚至版本 ${revisionId}`,
    });
  });

  revalidateTag("wiki-pages", "max");
}

const getCachedSearchablePages = unstable_cache(
  async () => {
    const pages = await db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        content: wikiPages.content,
      })
      .from(wikiPages)
      .where(isNull(wikiPages.deletedAt));
    return pages.map((p) => ({ ...p, content: extractText(p.content) }));
  },
  ["wiki-pages-search"],
  { tags: ["wiki-pages"] },
);

export async function searchWikiPages(query: string) {
  if (!query.trim()) return [];
  const searchable = await getCachedSearchablePages();
  return searchPages(searchable, query);
}

export async function getDeletedPages() {
  return db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      deletedAt: wikiPages.deletedAt,
    })
    .from(wikiPages)
    .where(sql`${wikiPages.deletedAt} IS NOT NULL`)
    .orderBy(desc(wikiPages.deletedAt));
}
