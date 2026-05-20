"use server";

import Fuse from "fuse.js";
import { db } from "@/db";
import { wikiPages, wikiRevisions } from "@/db/schema";
import { eq, isNull, and, sql, desc, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "@/lib/auth-guard";
import { validateSlug } from "@/lib/slug";

export async function getWikiPage(slug: string) {
  const page = await db.query.wikiPages.findFirst({
    where: and(eq(wikiPages.slug, slug), isNull(wikiPages.deletedAt)),
    with: {
      createdByUser: { columns: { nickname: true } },
      updatedByUser: { columns: { nickname: true } },
    },
  });
  return page ?? null;
}

export async function getWikiTree() {
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
}

export async function createWikiPage(data: {
  slug: string;
  title: string;
  content: string;
  parentId?: string | null;
}) {
  const user = await requireAuth();
  if (!validateSlug(data.slug)) throw new Error("Invalid slug");

  return db.transaction(async (tx) => {
    const [page] = await tx
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
      pageId: page.id,
      title: data.title,
      content: data.content,
      editedBy: user.id,
      editSummary: "创建页面",
    });

    return page;
  });
}

export async function updateWikiPage(data: {
  slug: string;
  title: string;
  content: string;
  editSummary?: string;
  expectedUpdatedAt: string;
}) {
  const user = await requireAuth();

  const existing = await db.query.wikiPages.findFirst({
    where: eq(wikiPages.slug, data.slug),
  });
  if (!existing) throw new Error("Page not found");

  return db.transaction(async (tx) => {
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
          eq(wikiPages.updatedAt, new Date(data.expectedUpdatedAt))
        )
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
}

export async function deleteWikiPage(pageId: string) {
  await requireAdmin();
  const now = new Date();

  const descendants = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM wiki_pages WHERE id = ${pageId}
      UNION ALL
      SELECT wp.id FROM wiki_pages wp JOIN tree t ON wp.parent_id = t.id
    )
    SELECT id FROM tree
  `);

  const ids = (descendants as any).rows.map((r: any) => r.id);
  if (ids.length === 0) return;

  await db
    .update(wikiPages)
    .set({ deletedAt: now })
    .where(inArray(wikiPages.id, ids));
}

export async function restoreWikiPage(pageId: string) {
  await requireAdmin();

  const related = await db.execute(sql`
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

  const ids = (related as any).rows.map((r: any) => r.id);
  if (ids.length === 0) return;

  await db
    .update(wikiPages)
    .set({ deletedAt: null })
    .where(inArray(wikiPages.id, ids));
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
    where: and(eq(wikiRevisions.id, revisionId), eq(wikiRevisions.pageId, pageId)),
  });
}

export async function rollbackToRevision(pageId: string, revisionId: string) {
  const user = await requireAuth();
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
}

export async function searchWikiPages(query: string) {
  if (!query.trim()) return [];

  const pages = await db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      content: wikiPages.content,
    })
    .from(wikiPages)
    .where(isNull(wikiPages.deletedAt));

  const fuse = new Fuse(pages, {
    keys: [
      { name: "title", weight: 2 },
      { name: "content", weight: 1 },
    ],
    threshold: 0.4,
    includeScore: true,
  });

  return fuse.search(query, { limit: 50 }).map((r) => ({
    id: r.item.id,
    slug: r.item.slug,
    title: r.item.title,
  }));
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
