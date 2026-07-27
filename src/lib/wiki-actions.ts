"use server";

import { db } from "@/db";
import {
  wikiPageAliases,
  wikiPages,
  wikiRevisions,
  wikiLinks,
} from "@/db/schema";
import {
  eq,
  isNull,
  isNotNull,
  and,
  sql,
  desc,
  inArray,
  gte,
  lt,
} from "drizzle-orm";
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
import { normalizeWikiIcon } from "@/lib/wiki-icon";
import {
  shouldCoalesceRevision,
  CREATE_REVISION_SUMMARY,
  ROLLBACK_REVISION_SUMMARY_PREFIX,
} from "@/lib/revision-coalescing";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockWikiTree(tx: Tx) {
  // Optimistic locking protects one page, but it cannot prevent concurrent
  // A -> B and B -> A moves from passing independent cycle checks.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('cupedia.wiki-tree'))`,
  );
}

async function lockWikiSlugNamespace(tx: Tx) {
  // Current slugs and historical aliases form one namespace even though they
  // live in separate tables. Serialize create/rename checks so an old slug
  // cannot be reclaimed while another transaction is recording its alias.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('cupedia.wiki-slug'))`,
  );
}

async function assertWikiSlugAvailable(
  tx: Tx,
  slug: string,
  pageId: string | null,
) {
  const result = await tx.execute(sql`
    SELECT
      EXISTS (
        SELECT 1
        FROM wiki_pages
        WHERE slug = ${slug}
          AND (${pageId}::uuid IS NULL OR id <> ${pageId}::uuid)
      )
      OR EXISTS (
        SELECT 1
        FROM wiki_page_aliases
        WHERE slug = ${slug}
          AND (${pageId}::uuid IS NULL OR page_id <> ${pageId}::uuid)
      ) AS "slugTaken"
  `);
  const [status] = (result.rows ?? result) as { slugTaken: boolean }[];
  if (status?.slugTaken) throw new Error("Slug already exists");
}

async function assertLiveWikiParent(tx: Tx, parentId: string) {
  const result = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM wiki_pages
      WHERE id = ${parentId} AND deleted_at IS NULL
    ) AS "parentExists"
  `);
  const [status] = (result.rows ?? result) as { parentExists: boolean }[];

  if (!status?.parentExists) throw new Error("Invalid parent page");
}

async function assertValidWikiParent(tx: Tx, pageId: string, parentId: string) {
  const result = await tx.execute(sql`
    WITH RECURSIVE descendants AS (
      SELECT id
      FROM wiki_pages
      WHERE id = ${pageId} AND deleted_at IS NULL

      UNION

      SELECT child.id
      FROM wiki_pages child
      JOIN descendants parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    SELECT
      EXISTS (
        SELECT 1
        FROM wiki_pages
        WHERE id = ${parentId} AND deleted_at IS NULL
      ) AS "parentExists",
      EXISTS (
        SELECT 1
        FROM descendants
        WHERE id = ${parentId}
      ) AS "createsCycle"
  `);
  const [status] = (result.rows ?? result) as {
    parentExists: boolean;
    createsCycle: boolean;
  }[];

  if (!status?.parentExists || status.createsCycle) {
    throw new Error("Invalid parent page");
  }
}

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
    if (page) return page;

    const alias = await db.query.wikiPageAliases.findFirst({
      where: eq(wikiPageAliases.slug, slug),
      with: {
        page: {
          with: {
            createdByUser: { columns: { nickname: true } },
            updatedByUser: { columns: { nickname: true } },
          },
        },
      },
    });
    return alias?.page && !alias.page.deletedAt ? alias.page : null;
  },
  ["wiki-page"],
  { tags: ["wiki-pages"] },
);

export async function getWikiPage(slug: string) {
  return getCachedWikiPage(slug);
}

// Editing needs an authoritative optimistic-lock baseline. A stale cached
// version or updatedAt turns the next legitimate save into a false conflict.
export async function getWikiPageForEdit(slug: string) {
  const page = await db.query.wikiPages.findFirst({
    where: and(eq(wikiPages.slug, slug), isNull(wikiPages.deletedAt)),
  });
  if (page) return page;

  const alias = await db.query.wikiPageAliases.findFirst({
    where: eq(wikiPageAliases.slug, slug),
    with: { page: true },
  });
  return alias?.page && !alias.page.deletedAt ? alias.page : null;
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
        icon: wikiPages.icon,
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
  icon?: string | null;
  content: string;
  parentId?: string | null;
}) {
  const user = await assertContributorComplete(await requireEditor());
  if (!validateSlug(data.slug)) throw new Error("Invalid slug");
  const icon = normalizeWikiIcon(data.icon);

  const page = await db.transaction(async (tx) => {
    await lockWikiSlugNamespace(tx);
    await assertWikiSlugAvailable(tx, data.slug, null);
    if (data.parentId) {
      await lockWikiTree(tx);
      await assertLiveWikiParent(tx, data.parentId);
    }

    const now = new Date();
    const [p] = await tx
      .insert(wikiPages)
      .values({
        slug: data.slug,
        title: data.title,
        icon,
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
  updateTag("wiki-pages");
  revalidateSearchCorpus();
  return page;
}

export interface UpdateConflict {
  conflict: true;
  /** Server's current content, for manual resolution. */
  theirContent: string;
  theirTitle: string;
  theirIcon: string | null;
  theirSlug: string;
  theirParentId: string | null;
  theirVersion: number;
  theirUpdatedAt: string;
}

type WikiPageRow = typeof wikiPages.$inferSelect;

function toUpdateConflict(page: WikiPageRow): UpdateConflict {
  return {
    conflict: true,
    theirContent: page.content,
    theirTitle: page.title,
    theirIcon: page.icon,
    theirSlug: page.slug,
    theirParentId: page.parentId,
    theirVersion: page.version,
    theirUpdatedAt: new Date(page.updatedAt).toISOString(),
  };
}

function mergeScalarField<T>(
  base: T | undefined,
  mine: T,
  theirs: T,
): { clean: true; value: T } | { clean: false } {
  if (base === undefined) return { clean: true, value: mine };

  const mineChanged = mine !== base;
  const theirsChanged = theirs !== base;
  if (!mineChanged && theirsChanged) return { clean: true, value: theirs };
  if (mineChanged && theirsChanged && mine !== theirs) {
    return { clean: false };
  }
  return { clean: true, value: mine };
}

/** Optimistically locked write; throws EDIT_CONFLICT if the baseline moved. */
async function writeWikiPage(
  data: {
    slug: string;
    nextSlug?: string;
    title: string;
    icon?: string | null;
    content: string;
    editSummary?: string;
    parentId?: string | null;
    expectedVersion: number;
    expectedUpdatedAt: string;
  },
  userId: string,
  pageId: string,
  options?: {
    validateParentChange?: boolean;
    validateSlugChange?: boolean;
  },
): Promise<WikiPageRow> {
  const expectedUpdatedAt = new Date(data.expectedUpdatedAt);
  if (
    !Number.isInteger(data.expectedVersion) ||
    data.expectedVersion < 1 ||
    Number.isNaN(expectedUpdatedAt.getTime())
  ) {
    throw new Error("Invalid edit baseline");
  }
  const expectedUpdatedBefore = new Date(expectedUpdatedAt.getTime() + 1);

  return db.transaction(async (tx) => {
    let originalSlug: string | null = null;
    if (options?.validateSlugChange) {
      const nextSlug = data.nextSlug ?? data.slug;
      await lockWikiSlugNamespace(tx);
      const [currentPage] = await tx
        .select({ slug: wikiPages.slug })
        .from(wikiPages)
        .where(and(eq(wikiPages.id, pageId), isNull(wikiPages.deletedAt)))
        .limit(1);
      if (!currentPage) throw new Error("Page not found");
      originalSlug = currentPage.slug;

      if (nextSlug !== originalSlug) {
        await assertWikiSlugAvailable(tx, nextSlug, pageId);
        await tx
          .delete(wikiPageAliases)
          .where(
            and(
              eq(wikiPageAliases.slug, nextSlug),
              eq(wikiPageAliases.pageId, pageId),
            ),
          );
      }
    }
    if (options?.validateParentChange) {
      await lockWikiTree(tx);
      if (data.parentId === pageId) throw new Error("Invalid parent page");
      if (data.parentId) {
        await assertValidWikiParent(tx, pageId, data.parentId);
      }
    }

    const updated = await tx
      .update(wikiPages)
      .set({
        ...(data.nextSlug !== undefined ? { slug: data.nextSlug } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        title: data.title,
        content: data.content,
        updatedBy: userId,
        updatedAt: new Date(),
        version: sql`${wikiPages.version} + 1`,
      })
      .where(
        and(
          eq(wikiPages.id, pageId),
          eq(wikiPages.version, data.expectedVersion),
          // Compatibility guard for pre-version deployments: old writers do
          // not advance `version`, but they do move `updatedAt`. Compare the
          // millisecond window visible to JavaScript so PostgreSQL microseconds
          // cannot recreate the false conflict this lock replaces.
          gte(wikiPages.updatedAt, expectedUpdatedAt),
          lt(wikiPages.updatedAt, expectedUpdatedBefore),
          isNull(wikiPages.deletedAt),
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
    if (
      originalSlug !== null &&
      data.nextSlug !== undefined &&
      data.nextSlug !== originalSlug
    ) {
      await tx
        .insert(wikiPageAliases)
        .values({ slug: originalSlug, pageId })
        .onConflictDoNothing();
    }
    return updated[0];
  });
}

export async function updateWikiPage(data: {
  pageId?: string;
  slug: string;
  nextSlug?: string;
  title: string;
  icon?: string | null;
  content: string;
  editSummary?: string;
  parentId?: string | null;
  expectedVersion: number;
  expectedUpdatedAt: string;
  /** Ancestor title for scalar three-way merge. */
  baseTitle?: string;
  /** Ancestor page icon for scalar three-way merge. */
  baseIcon?: string | null;
  /** Ancestor content (editor's initialValue) for three-way merge. */
  baseContent?: string;
  /** Ancestor URL path for scalar three-way merge. */
  baseSlug?: string;
  /** Ancestor parent for scalar three-way merge. */
  baseParentId?: string | null;
}): Promise<WikiPageRow | UpdateConflict> {
  const user = await assertContributorComplete(await requireEditor());
  const nextSlug = data.nextSlug ?? data.slug;
  if (!validateSlug(nextSlug)) throw new Error("Invalid slug");
  const normalizedIcon =
    data.icon === undefined ? undefined : normalizeWikiIcon(data.icon);
  const normalizedData =
    data.icon === undefined ? data : { ...data, icon: normalizedIcon };

  const existing = await db.query.wikiPages.findFirst({
    where: and(
      data.pageId
        ? eq(wikiPages.id, data.pageId)
        : eq(wikiPages.slug, data.slug),
      isNull(wikiPages.deletedAt),
    ),
  });
  if (!existing) throw new Error("Page not found");

  // A title change is structural (title carries search weight 2); a body-only
  // edit is not, so it rides the corpus's time-based refresh. See ADR 0011.
  const titleChanged = data.title !== existing.title;
  const slugChanged = nextSlug !== existing.slug;
  const parentChanged =
    data.parentId !== undefined && data.parentId !== existing.parentId;
  const iconChanged =
    normalizedIcon !== undefined && normalizedIcon !== existing.icon;

  try {
    const result = await writeWikiPage(normalizedData, user.id, existing.id, {
      validateParentChange: parentChanged,
      validateSlugChange: slugChanged,
    });
    revalidateTag("wiki-pages", "max");
    revalidatePath(`/wiki/${result.slug}`);
    if (slugChanged) revalidatePath(`/wiki/${existing.slug}`);
    // updateTag immediately refreshes the current Server Action route. During
    // a slug rename that route still contains the old slug and would render a
    // 404 before the client can replace its URL. `revalidateTag(..., "max")`
    // above expires the tree safely while the editor adopts the new route.
    if (!slugChanged && (titleChanged || parentChanged || iconChanged)) {
      updateTag("wiki-pages");
    }
    if (titleChanged || slugChanged) revalidateSearchCorpus();
    return result;
  } catch (e) {
    if (!(e instanceof Error && e.message === "EDIT_CONFLICT")) throw e;
  }

  const latest = await db.query.wikiPages.findFirst({
    where: and(eq(wikiPages.id, existing.id), isNull(wikiPages.deletedAt)),
  });
  if (!latest) throw new Error("Page not found");
  const theirUpdatedAt = new Date(latest.updatedAt).toISOString();

  if (data.baseContent !== undefined) {
    let mergedTitle = data.title;
    if (data.baseTitle !== undefined) {
      const mineChanged = data.title !== data.baseTitle;
      const theirsChanged = latest.title !== data.baseTitle;

      if (!mineChanged && theirsChanged) {
        mergedTitle = latest.title;
      } else if (mineChanged && theirsChanged && data.title !== latest.title) {
        return toUpdateConflict(latest);
      }
    }

    const slugMerge = mergeScalarField(data.baseSlug, nextSlug, latest.slug);
    if (!slugMerge.clean) {
      return toUpdateConflict(latest);
    }

    let mergedParentId = data.parentId;
    if (data.parentId !== undefined) {
      const parentMerge = mergeScalarField(
        data.baseParentId,
        data.parentId,
        latest.parentId,
      );
      if (!parentMerge.clean) {
        return toUpdateConflict(latest);
      }
      mergedParentId = parentMerge.value;
    }

    let mergedIcon = normalizedIcon;
    if (normalizedIcon !== undefined) {
      const iconMerge = mergeScalarField(
        data.baseIcon,
        normalizedIcon,
        latest.icon,
      );
      if (!iconMerge.clean) {
        return toUpdateConflict(latest);
      }
      mergedIcon = iconMerge.value;
    }

    const merged = await threeWayMergeContent({
      base: data.baseContent,
      mine: data.content,
      theirs: latest.content,
    });
    if (merged.clean && merged.content) {
      let result: WikiPageRow;
      try {
        result = await writeWikiPage(
          {
            ...normalizedData,
            nextSlug: slugMerge.value,
            parentId: mergedParentId,
            icon: mergedIcon,
            title: mergedTitle,
            content: merged.content,
            expectedVersion: latest.version,
            expectedUpdatedAt: theirUpdatedAt,
          },
          user.id,
          existing.id,
          {
            validateParentChange:
              mergedParentId !== undefined &&
              mergedParentId !== latest.parentId,
            validateSlugChange: slugMerge.value !== latest.slug,
          },
        );
      } catch (error) {
        if (!(error instanceof Error && error.message === "EDIT_CONFLICT")) {
          throw error;
        }
        const newest = await db.query.wikiPages.findFirst({
          where: and(
            eq(wikiPages.id, existing.id),
            isNull(wikiPages.deletedAt),
          ),
        });
        if (!newest) throw new Error("Page not found");
        return toUpdateConflict(newest);
      }
      revalidateTag("wiki-pages", "max");
      revalidatePath(`/wiki/${result.slug}`);
      const mergedSlugChanged = slugMerge.value !== latest.slug;
      if (mergedSlugChanged) revalidatePath(`/wiki/${latest.slug}`);
      if (
        !mergedSlugChanged &&
        (mergedTitle !== latest.title ||
          (mergedParentId !== undefined &&
            mergedParentId !== latest.parentId) ||
          (mergedIcon !== undefined && mergedIcon !== latest.icon))
      ) {
        updateTag("wiki-pages");
      }
      if (mergedTitle !== latest.title || slugMerge.value !== latest.slug) {
        revalidateSearchCorpus();
      }
      return result;
    }
  }

  return toUpdateConflict(latest);
}

export async function deleteWikiPage(pageId: string) {
  await requireAdmin();
  const now = new Date();

  const deleted = await db.transaction(async (tx) => {
    await lockWikiTree(tx);
    const descendantResult = await tx.execute(sql`
      WITH RECURSIVE tree AS (
        SELECT id FROM wiki_pages WHERE id = ${pageId}
        UNION
        SELECT wp.id FROM wiki_pages wp JOIN tree t ON wp.parent_id = t.id
      )
      SELECT id FROM tree
    `);

    const ids = (
      (descendantResult.rows ?? descendantResult) as { id: string }[]
    ).map((r) => r.id);
    if (ids.length === 0) return false;

    await tx
      .update(wikiPages)
      .set({
        deletedAt: now,
        version: sql`${wikiPages.version} + 1`,
      })
      .where(and(inArray(wikiPages.id, ids), isNull(wikiPages.deletedAt)));
    return true;
  });
  if (!deleted) return;

  updateTag("wiki-pages");
  revalidatePath("/wiki", "layout");
  revalidatePath("/admin/deleted");
  revalidateSearchCorpus();
}

export async function restoreWikiPage(pageId: string) {
  await requireAdmin();

  const restored = await db.transaction(async (tx) => {
    await lockWikiTree(tx);
    const relatedResult = await tx.execute(sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM wiki_pages WHERE id = ${pageId}
        UNION
        SELECT wp.id, wp.parent_id FROM wiki_pages wp JOIN ancestors a ON a.parent_id = wp.id
      ),
      descendants AS (
        SELECT id FROM wiki_pages WHERE id = ${pageId}
        UNION
        SELECT wp.id FROM wiki_pages wp JOIN descendants d ON wp.parent_id = d.id
      )
      SELECT id FROM ancestors
      UNION
      SELECT id FROM descendants
    `);

    const ids = ((relatedResult.rows ?? relatedResult) as { id: string }[]).map(
      (r) => r.id,
    );
    if (ids.length === 0) return false;

    await tx
      .update(wikiPages)
      .set({
        deletedAt: null,
        version: sql`${wikiPages.version} + 1`,
      })
      .where(and(inArray(wikiPages.id, ids), isNotNull(wikiPages.deletedAt)));
    return true;
  });
  if (!restored) return;

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
        version: sql`${wikiPages.version} + 1`,
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
