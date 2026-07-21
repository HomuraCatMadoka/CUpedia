"use server";

import { db } from "@/db";
import { wikiPages, wikiRevisions, wikiLinks } from "@/db/schema";
import { eq, isNull, and, sql, desc, inArray } from "drizzle-orm";
import {
  revalidatePath,
  unstable_cache,
  revalidateTag,
  updateTag,
} from "next/cache";
import { requireAdmin, requireEditor } from "@/lib/auth-guard";
import { assertContributorComplete } from "@/lib/contributor-account";
import { validateSlug } from "@/lib/slug";
import { searchPages } from "@/lib/search";
import { extractText } from "@/lib/plate-utils";
import { extractWikiLinkTargets } from "@/lib/wiki-links";
import { threeWayMergeContent } from "@/lib/merge-content";
import {
  shouldCoalesceRevision,
  CREATE_REVISION_SUMMARY,
  ROLLBACK_REVISION_SUMMARY_PREFIX,
} from "@/lib/revision-coalescing";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The search corpus is its own cache bucket (ADR 0011). It is NOT tagged
// `wiki-pages`, so a content-only edit no longer rebuilds the whole corpus on
// every autosave tick; low-value freshness (a body typo in a search excerpt)
// rides this time-based refresh instead. Structural change — a page
// appearing/disappearing or its title (search weight 2) changing — calls
// `revalidateSearchCorpus()` for immediate, high-value freshness.
const SEARCH_CORPUS_TAG = "wiki-search-corpus";
const SEARCH_CORPUS_REVALIDATE_SECONDS = 5 * 60;

function revalidateSearchCorpus() {
  revalidateTag(SEARCH_CORPUS_TAG, "max");
}

/** Rewrite the outgoing wiki-link rows for a source page from its content. */
async function syncWikiLinks(tx: Tx, sourceId: string, content: string) {
  await tx.delete(wikiLinks).where(eq(wikiLinks.sourceId, sourceId));
  const targets = extractWikiLinkTargets(content).filter(
    (id) => id !== sourceId,
  );
  if (targets.length === 0) return;
  const live = await tx
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(and(inArray(wikiPages.id, targets), isNull(wikiPages.deletedAt)));
  const valid = new Set(live.map((p) => p.id));
  const rows = targets
    .filter((id) => valid.has(id))
    .map((targetId) => ({ sourceId, targetId }));
  if (rows.length > 0) await tx.insert(wikiLinks).values(rows);
}

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

// Editing needs an authoritative optimistic-lock baseline. A stale cached
// updatedAt turns the next legitimate save into a false EDIT_CONFLICT.
export async function getWikiPageForEdit(slug: string) {
  return (
    (await db.query.wikiPages.findFirst({
      where: and(eq(wikiPages.slug, slug), isNull(wikiPages.deletedAt)),
    })) ?? null
  );
}

const getCachedBacklinks = unstable_cache(
  async (pageId: string) => {
    return db
      .select({ slug: wikiPages.slug, title: wikiPages.title })
      .from(wikiLinks)
      .innerJoin(wikiPages, eq(wikiLinks.sourceId, wikiPages.id))
      .where(and(eq(wikiLinks.targetId, pageId), isNull(wikiPages.deletedAt)))
      .orderBy(wikiPages.title);
  },
  ["wiki-backlinks"],
  { tags: ["wiki-pages"] },
);

export async function getBacklinks(pageId: string) {
  // Auxiliary read path — degrade to empty rather than failing the page.
  try {
    return await getCachedBacklinks(pageId);
  } catch (error) {
    console.error("getBacklinks: query failed", error);
    return [];
  }
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
  const user = await assertContributorComplete(await requireEditor());
  if (!validateSlug(data.slug)) throw new Error("Invalid slug");

  const page = await db.transaction(async (tx) => {
    const now = new Date();
    const [p] = await tx
      .insert(wikiPages)
      .values({
        slug: data.slug,
        title: data.title,
        content: data.content,
        parentId: data.parentId ?? null,
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx.insert(wikiRevisions).values({
      pageId: p.id,
      title: data.title,
      content: data.content,
      editedBy: user.id,
      editSummary: CREATE_REVISION_SUMMARY,
    });

    await syncWikiLinks(tx, p.id, data.content);
    return p;
  });

  revalidateTag("wiki-pages", "max");
  revalidateSearchCorpus();
  return page;
}

export interface UpdateConflict {
  conflict: true;
  /** Server's current content, for manual resolution. */
  theirContent: string;
  theirTitle: string;
  theirUpdatedAt: string;
}

type WikiPageRow = typeof wikiPages.$inferSelect;

/** Optimistically-locked write; throws EDIT_CONFLICT if updatedAt moved. */
async function writeWikiPage(
  data: {
    slug: string;
    title: string;
    content: string;
    editSummary?: string;
    expectedUpdatedAt: string;
  },
  userId: string,
  pageId: string,
): Promise<WikiPageRow> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(wikiPages)
      .set({
        title: data.title,
        content: data.content,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wikiPages.id, pageId),
          eq(wikiPages.updatedAt, new Date(data.expectedUpdatedAt)),
        ),
      )
      .returning();

    if (updated.length === 0) throw new Error("EDIT_CONFLICT");

    const now = updated[0].updatedAt;
    const [latestRevision] = await tx
      .select({
        id: wikiRevisions.id,
        editedBy: wikiRevisions.editedBy,
        createdAt: wikiRevisions.createdAt,
        editSummary: wikiRevisions.editSummary,
      })
      .from(wikiRevisions)
      .where(eq(wikiRevisions.pageId, pageId))
      .orderBy(desc(wikiRevisions.createdAt))
      .limit(1);

    if (shouldCoalesceRevision(latestRevision, { userId, at: now })) {
      // Fold this write into the ongoing sitting: update the latest revision in
      // place and slide its window anchor (createdAt) forward. See ADR 0009.
      await tx
        .update(wikiRevisions)
        .set({
          title: data.title,
          content: data.content,
          editSummary: data.editSummary ?? null,
          createdAt: now,
        })
        .where(eq(wikiRevisions.id, latestRevision.id));
    } else {
      await tx.insert(wikiRevisions).values({
        pageId,
        title: data.title,
        content: data.content,
        editedBy: userId,
        editSummary: data.editSummary ?? null,
      });
    }

    await syncWikiLinks(tx, pageId, data.content);
    return updated[0];
  });
}

export async function updateWikiPage(data: {
  slug: string;
  title: string;
  content: string;
  editSummary?: string;
  expectedUpdatedAt: string;
  /** Ancestor content (editor's initialValue) for three-way merge. */
  baseContent?: string;
}): Promise<WikiPageRow | UpdateConflict> {
  const user = await assertContributorComplete(await requireEditor());

  const existing = await db.query.wikiPages.findFirst({
    where: eq(wikiPages.slug, data.slug),
  });
  if (!existing) throw new Error("Page not found");

  // A title change is structural (title carries search weight 2); a body-only
  // edit is not, so it rides the corpus's time-based refresh. See ADR 0011.
  const titleChanged = data.title !== existing.title;

  try {
    const result = await writeWikiPage(data, user.id, existing.id);
    revalidateTag("wiki-pages", "max");
    if (titleChanged) revalidateSearchCorpus();
    return result;
  } catch (e) {
    if (!(e instanceof Error && e.message === "EDIT_CONFLICT")) throw e;
  }

  const latest = await db.query.wikiPages.findFirst({
    where: eq(wikiPages.id, existing.id),
  });
  if (!latest) throw new Error("Page not found");
  const theirUpdatedAt = new Date(latest.updatedAt).toISOString();

  if (data.baseContent !== undefined) {
    const merged = await threeWayMergeContent({
      base: data.baseContent,
      mine: data.content,
      theirs: latest.content,
    });
    if (merged.clean && merged.content) {
      const result = await writeWikiPage(
        { ...data, content: merged.content, expectedUpdatedAt: theirUpdatedAt },
        user.id,
        existing.id,
      );
      revalidateTag("wiki-pages", "max");
      // Gate on `latest.title` (the post-conflict state this write overwrites),
      // not `existing.title` (the stale pre-conflict baseline): a concurrent
      // rename may have already moved the title, so `data.title` could revert
      // it — still a structural change the corpus must reflect. See ADR 0011.
      if (data.title !== latest.title) revalidateSearchCorpus();
      return result;
    }
  }

  return {
    conflict: true,
    theirContent: latest.content,
    theirTitle: latest.title,
    theirUpdatedAt,
  };
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

  updateTag("wiki-pages");
  revalidatePath("/wiki", "layout");
  revalidatePath("/admin/deleted");
  revalidateSearchCorpus();
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

  updateTag("wiki-pages");
  revalidatePath("/wiki", "layout");
  revalidatePath("/admin/deleted");
  revalidateSearchCorpus();
}

export async function getRevisions(pageId: string) {
  // The history list renders only metadata — never the body. Project away the
  // full `content` (a whole Plate document per row) so it isn't hauled over the
  // app↔db link for nothing (#142).
  return db.query.wikiRevisions.findMany({
    where: eq(wikiRevisions.pageId, pageId),
    orderBy: [desc(wikiRevisions.createdAt)],
    columns: {
      id: true,
      title: true,
      editSummary: true,
      createdAt: true,
    },
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
  const user = await assertContributorComplete(await requireEditor());
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
      editSummary: `${ROLLBACK_REVISION_SUMMARY_PREFIX}${revisionId}`,
    });
  });

  revalidateTag("wiki-pages", "max");
  if (revision.title !== existing.title) revalidateSearchCorpus();
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
  { tags: [SEARCH_CORPUS_TAG], revalidate: SEARCH_CORPUS_REVALIDATE_SECONDS },
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
