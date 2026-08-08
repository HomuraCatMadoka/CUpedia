"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { connection } from "next/server";

import { db } from "@/db";
import { wikiDrafts, wikiLinks, wikiPages, wikiRevisions } from "@/db/schema";
import { getOptionalUser, requireEditor } from "@/lib/auth-guard";
import { assertContributorComplete } from "@/lib/contributor-account";
import { extractWikiLinkTargets } from "@/lib/wiki-links";
import { normalizeWikiIcon } from "@/lib/wiki-icon";
import { CREATE_REVISION_SUMMARY } from "@/lib/revision-coalescing";

const CLIENT_PAGE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_WIKI_CONTENT = JSON.stringify([
  { type: "p", children: [{ text: "" }] },
]);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type WikiDraftRow = typeof wikiDrafts.$inferSelect;

function assertDraftId(id: string) {
  if (!CLIENT_PAGE_ID_RE.test(id)) throw new Error("Invalid page id");
}

async function assertDraftParent(
  tx: Tx,
  userId: string,
  pageId: string,
  parentId: string,
) {
  if (pageId === parentId) throw new Error("Invalid parent page");
  const result = await tx.execute(sql`
    WITH RECURSIVE descendants AS (
      SELECT id FROM wiki_drafts
      WHERE parent_id = ${pageId} AND created_by = ${userId}
      UNION
      SELECT child.id FROM wiki_drafts child
      JOIN descendants parent ON child.parent_id = parent.id
      WHERE child.created_by = ${userId}
    )
    SELECT
      (
        EXISTS (
          SELECT 1 FROM wiki_pages
          WHERE id = ${parentId} AND deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM wiki_drafts
          WHERE id = ${parentId} AND created_by = ${userId}
        )
      ) AS "parentExists",
      EXISTS (
        SELECT 1 FROM descendants WHERE id = ${parentId}
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

async function assertPublicParent(tx: Tx, parentId: string) {
  const result = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM wiki_pages
      WHERE id = ${parentId} AND deleted_at IS NULL
    ) AS "parentExists"
  `);
  const [status] = (result.rows ?? result) as { parentExists: boolean }[];
  if (!status?.parentExists) throw new Error("Publish the parent page first");
}

async function syncWikiLinks(tx: Tx, sourceId: string, content: string) {
  const targets = extractWikiLinkTargets(content).filter(
    (id) => id !== sourceId,
  );
  if (targets.length === 0) return;
  const live = await tx
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(and(inArray(wikiPages.id, targets), isNull(wikiPages.deletedAt)));
  const valid = new Set(live.map((page) => page.id));
  const rows = targets
    .filter((id) => valid.has(id))
    .map((targetId) => ({ sourceId, targetId }));
  if (rows.length > 0) await tx.insert(wikiLinks).values(rows);
}

export async function getOwnWikiDraft(pageId: string) {
  if (!CLIENT_PAGE_ID_RE.test(pageId)) return null;
  const user = await getOptionalUser();
  if (!user?.id) return null;
  return (
    (await db.query.wikiDrafts.findFirst({
      where: and(eq(wikiDrafts.id, pageId), eq(wikiDrafts.createdBy, user.id)),
    })) ?? null
  );
}

export async function getOwnWikiDraftTree() {
  // This is private, user-specific state. Keep it outside the route cache even
  // when the surrounding wiki layout is reused between page navigations.
  await connection();
  const user = await getOptionalUser();
  if (!user?.id) return [];
  const drafts = await db
    .select({
      id: wikiDrafts.id,
      title: wikiDrafts.title,
      icon: wikiDrafts.icon,
      parentId: wikiDrafts.parentId,
    })
    .from(wikiDrafts)
    .where(eq(wikiDrafts.createdBy, user.id))
    .orderBy(wikiDrafts.createdAt);
  return drafts.map((draft, index) => ({ ...draft, sortOrder: index }));
}

export async function createWikiDraft(data: {
  id: string;
  parentId?: string | null;
}) {
  const user = await assertContributorComplete(await requireEditor());
  assertDraftId(data.id);

  const existing = await db.query.wikiDrafts.findFirst({
    where: eq(wikiDrafts.id, data.id),
  });
  if (existing) {
    if (existing.createdBy === user.id) return existing;
    throw new Error("DRAFT_ID_CONFLICT");
  }

  const created = await db.transaction(async (tx) => {
    if (data.parentId) {
      await assertDraftParent(tx, user.id, data.id, data.parentId);
    }
    const inserted = await tx
      .insert(wikiDrafts)
      .values({
        id: data.id,
        content: EMPTY_WIKI_CONTENT,
        parentId: data.parentId ?? null,
        createdBy: user.id,
      })
      .onConflictDoNothing({ target: wikiDrafts.id })
      .returning();
    if (inserted[0]) return inserted[0];

    const concurrent = await tx.query.wikiDrafts.findFirst({
      where: eq(wikiDrafts.id, data.id),
    });
    if (concurrent?.createdBy === user.id) return concurrent;
    throw new Error("DRAFT_ID_CONFLICT");
  });
  revalidatePath("/wiki", "layout");
  return created;
}

export async function updateWikiDraft(data: {
  pageId: string;
  title: string;
  icon?: string | null;
  content: string;
  parentId?: string | null;
  expectedVersion: number;
  baseTitle?: string;
  baseIcon?: string | null;
  baseContent?: string;
  baseParentId?: string | null;
}) {
  const user = await assertContributorComplete(await requireEditor());
  assertDraftId(data.pageId);
  if (!Number.isInteger(data.expectedVersion) || data.expectedVersion < 1) {
    throw new Error("Invalid edit baseline");
  }

  const normalizedIcon =
    data.icon === undefined ? undefined : normalizeWikiIcon(data.icon);
  const updateAtVersion = (tx: Tx, expectedVersion: number) =>
    tx
      .update(wikiDrafts)
      .set({
        title: data.title,
        content: data.content,
        ...(normalizedIcon === undefined ? {} : { icon: normalizedIcon }),
        ...(data.parentId === undefined ? {} : { parentId: data.parentId }),
        updatedAt: new Date(),
        version: sql`${wikiDrafts.version} + 1`,
      })
      .where(
        and(
          eq(wikiDrafts.id, data.pageId),
          eq(wikiDrafts.createdBy, user.id),
          eq(wikiDrafts.version, expectedVersion),
        ),
      )
      .returning();
  const updated = await db.transaction(async (tx) => {
    if (data.parentId) {
      await assertDraftParent(tx, user.id, data.pageId, data.parentId);
    }
    return updateAtVersion(tx, data.expectedVersion);
  });
  if (updated[0]) return updated[0];

  const latest = await db.query.wikiDrafts.findFirst({
    where: and(
      eq(wikiDrafts.id, data.pageId),
      eq(wikiDrafts.createdBy, user.id),
    ),
  });
  if (!latest) throw new Error("Page not found");
  const requestedMatchesLatest =
    latest.title === data.title &&
    latest.content === data.content &&
    (normalizedIcon === undefined || latest.icon === normalizedIcon) &&
    (data.parentId === undefined || latest.parentId === data.parentId);
  if (requestedMatchesLatest) return latest;

  const baseIcon =
    data.baseIcon === undefined ? undefined : normalizeWikiIcon(data.baseIcon);
  const latestMatchesBase =
    data.baseTitle !== undefined &&
    data.baseContent !== undefined &&
    data.baseIcon !== undefined &&
    data.baseParentId !== undefined &&
    latest.title === data.baseTitle &&
    latest.content === data.baseContent &&
    latest.icon === baseIcon &&
    latest.parentId === data.baseParentId;
  if (latestMatchesBase) {
    const retried = await db.transaction(async (tx) => {
      if (data.parentId) {
        await assertDraftParent(tx, user.id, data.pageId, data.parentId);
      }
      return updateAtVersion(tx, latest.version);
    });
    if (retried[0]) return retried[0];
  }

  const conflicting = latestMatchesBase
    ? await db.query.wikiDrafts.findFirst({
        where: and(
          eq(wikiDrafts.id, data.pageId),
          eq(wikiDrafts.createdBy, user.id),
        ),
      })
    : latest;
  if (!conflicting) throw new Error("Page not found");
  return {
    conflict: true as const,
    theirContent: conflicting.content,
    theirTitle: conflicting.title,
    theirIcon: conflicting.icon,
    theirParentId: conflicting.parentId,
    theirVersion: conflicting.version,
    theirContentGeneration: 0,
    theirUpdatedAt: new Date(conflicting.updatedAt).toISOString(),
  };
}

export async function publishWikiDraft(pageId: string) {
  const user = await assertContributorComplete(await requireEditor());
  assertDraftId(pageId);

  const alreadyPublished = await db.query.wikiPages.findFirst({
    where: eq(wikiPages.id, pageId),
  });
  if (alreadyPublished) {
    if (alreadyPublished.createdBy === user.id) return alreadyPublished;
    throw new Error("PAGE_CREATE_ID_CONFLICT");
  }

  let published: typeof wikiPages.$inferSelect;
  try {
    published = await db.transaction(async (tx) => {
      const draft = await tx.query.wikiDrafts.findFirst({
        where: and(
          eq(wikiDrafts.id, pageId),
          eq(wikiDrafts.createdBy, user.id),
        ),
      });
      if (!draft) throw new Error("Page not found");
      const title = draft.title.trim();
      if (!title) throw new Error("页面标题不能为空");
      if (draft.parentId) await assertPublicParent(tx, draft.parentId);

      const now = new Date();
      const [page] = await tx
        .insert(wikiPages)
        .values({
          id: draft.id,
          title,
          icon: draft.icon,
          content: draft.content,
          parentId: draft.parentId,
          createdBy: user.id,
          updatedBy: user.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await tx.insert(wikiRevisions).values({
        pageId: page.id,
        title,
        content: page.content,
        editedBy: user.id,
        editSummary: CREATE_REVISION_SUMMARY,
      });
      await syncWikiLinks(tx, page.id, page.content);
      await tx.delete(wikiDrafts).where(eq(wikiDrafts.id, draft.id));
      return page;
    });
  } catch (error) {
    if (
      !(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      )
    ) {
      throw error;
    }
    const concurrent = await db.query.wikiPages.findFirst({
      where: eq(wikiPages.id, pageId),
    });
    if (concurrent?.createdBy !== user.id) {
      throw new Error("PAGE_CREATE_ID_CONFLICT");
    }
    published = concurrent;
  }

  revalidateTag("wiki-pages", "max");
  updateTag("wiki-pages");
  revalidateTag("wiki-search-corpus", "max");
  revalidatePath("/wiki", "layout");
  revalidatePath(`/wiki/${published.id}`);
  return published;
}

export async function deleteWikiDraft(pageId: string) {
  const user = await requireEditor();
  assertDraftId(pageId);
  await db
    .delete(wikiDrafts)
    .where(and(eq(wikiDrafts.id, pageId), eq(wikiDrafts.createdBy, user.id)));
  revalidatePath("/wiki", "layout");
}

export type WikiDraft = WikiDraftRow;
