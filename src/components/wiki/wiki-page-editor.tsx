import { getDiscussions } from "@/lib/discussion-actions";
import {
  deleteWikiPage,
  getWikiPageForEdit,
  getWikiTree,
  updateWikiPage,
} from "@/lib/wiki-actions";
import {
  createWikiDraft,
  deleteWikiDraft,
  getOwnWikiDraft,
  publishWikiDraft,
  updateWikiDraft,
  type WikiDraft,
} from "@/lib/wiki-draft-actions";
import { stripTitleHeading } from "@/lib/headings";
import { parseContent } from "@/lib/plate-utils";
import {
  resolveWikiLinkUrls,
  restoreLegacyChildPageLinks,
  stripLegacyChildPageLinks,
} from "@/lib/wiki-links";
import { WikiEditorLazy } from "@/components/wiki/wiki-editor-lazy";

type EditablePage = NonNullable<Awaited<ReturnType<typeof getWikiPageForEdit>>>;
type WikiTree = Awaited<ReturnType<typeof getWikiTree>>;

function toEditorValue(
  page: Pick<EditablePage, "content" | "title">,
  childPageIds: string[],
) {
  return stripTitleHeading(
    resolveWikiLinkUrls(
      stripLegacyChildPageLinks(
        parseContent(page.content),
        new Set(childPageIds),
      ),
    ),
    page.title,
  );
}

function collectDescendantIds(
  pages: { id: string; parentId: string | null }[],
  pageId: string,
) {
  const childrenByParent = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.parentId) continue;
    const children = childrenByParent.get(page.parentId) ?? [];
    children.push(page.id);
    childrenByParent.set(page.parentId, children);
  }

  const excluded = new Set([pageId]);
  const queue = [pageId];
  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor++];
    for (const childId of childrenByParent.get(current) ?? []) {
      if (excluded.has(childId)) continue;
      excluded.add(childId);
      queue.push(childId);
    }
  }

  return excluded;
}

export async function WikiPageEditor({
  page,
  pages,
  userId,
  canDelete = false,
}: {
  page: EditablePage;
  pages: WikiTree;
  userId: string;
  canDelete?: boolean;
}) {
  const pageId = page.id;
  const discussions = await getDiscussions(pageId);
  const excludedParentIds = collectDescendantIds(pages, pageId);
  const childPages = pages.filter((candidate) => candidate.parentId === pageId);
  const childPageIds = childPages.map((child) => child.id);

  async function handleCheckForUpdate(currentVersion: number) {
    "use server";
    const latest = await getWikiPageForEdit(pageId);
    if (!latest || latest.version === currentVersion) return null;
    const latestTree = await getWikiTree();
    const latestChildPageIds = latestTree
      .filter((candidate) => candidate.parentId === pageId)
      .map((child) => child.id);
    return {
      id: latest.id,
      parentId: latest.parentId,
      title: latest.title,
      icon: latest.icon,
      content: JSON.stringify(toEditorValue(latest, latestChildPageIds)),
      version: latest.version,
      contentGeneration: latest.contentGeneration,
      updatedAt: new Date(latest.updatedAt).toISOString(),
    };
  }

  async function handleUpdate(data: {
    title: string;
    icon?: string | null;
    content: string;
    editSummary?: string;
    parentId?: string | null;
    expectedVersion?: number;
    expectedContentGeneration?: number;
    expectedUpdatedAt?: string;
    baseTitle?: string;
    baseIcon?: string | null;
    baseContent?: string;
    baseParentId?: string | null;
  }) {
    "use server";
    try {
      const storedPage = await getWikiPageForEdit(pageId);
      if (!storedPage) throw new Error("Page not found");
      const hiddenChildPageIds = new Set(childPageIds);
      const storedValue = parseContent(storedPage.content);
      const restoreEditorProjection = (content: string) =>
        JSON.stringify(
          restoreLegacyChildPageLinks(
            storedValue,
            parseContent(content),
            hiddenChildPageIds,
          ),
        );
      const updated = await updateWikiPage({
        pageId,
        title: data.title,
        icon: data.icon,
        content: restoreEditorProjection(data.content),
        editSummary: data.editSummary,
        parentId: data.parentId,
        expectedVersion: data.expectedVersion!,
        expectedContentGeneration: data.expectedContentGeneration!,
        expectedUpdatedAt: data.expectedUpdatedAt!,
        baseTitle: data.baseTitle,
        baseIcon: data.baseIcon,
        baseContent:
          data.baseContent === undefined
            ? undefined
            : restoreEditorProjection(data.baseContent),
        baseParentId: data.baseParentId,
      });
      const latestTree = await getWikiTree();
      const latestChildPageIds = latestTree
        .filter((candidate) => candidate.parentId === pageId)
        .map((child) => child.id);
      if ("conflict" in updated) {
        return {
          conflict: true as const,
          theirContent: JSON.stringify(
            toEditorValue(
              {
                title: updated.theirTitle,
                content: updated.theirContent,
              },
              latestChildPageIds,
            ),
          ),
          theirTitle: updated.theirTitle,
          theirIcon: updated.theirIcon,
          theirParentId: updated.theirParentId,
          theirVersion: updated.theirVersion,
          theirContentGeneration: updated.theirContentGeneration,
          theirUpdatedAt: updated.theirUpdatedAt,
        };
      }
      return {
        id: updated.id,
        parentId: updated.parentId,
        title: updated.title,
        icon: updated.icon,
        content: JSON.stringify(toEditorValue(updated, latestChildPageIds)),
        version: updated.version,
        contentGeneration: updated.contentGeneration,
        updatedAt: new Date(updated.updatedAt).toISOString(),
      };
    } catch (error: unknown) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function handleDelete() {
    "use server";
    await deleteWikiPage(pageId);
  }

  return (
    <WikiEditorLazy
      mode="edit"
      userId={userId}
      pageId={pageId}
      initialTitle={page.title}
      initialIcon={page.icon}
      initialValue={toEditorValue(page, childPageIds)}
      parentId={page.parentId}
      expectedVersion={page.version}
      expectedContentGeneration={page.contentGeneration}
      expectedUpdatedAt={new Date(page.updatedAt).toISOString()}
      linkablePages={pages
        .filter((candidate) => !excludedParentIds.has(candidate.id))
        .map((candidate) => ({
          id: candidate.id,
          title: candidate.title,
          icon: candidate.icon,
        }))}
      childPages={childPages.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        icon: candidate.icon,
      }))}
      initialDiscussions={discussions}
      canDelete={canDelete}
      onDelete={canDelete ? handleDelete : undefined}
      onCheckForUpdate={handleCheckForUpdate}
      onSubmit={handleUpdate}
    />
  );
}

export function WikiDraftPageEditor({
  pageId,
  parentId,
  draft,
  pages,
  userId,
}: {
  pageId: string;
  parentId: string | null;
  draft: WikiDraft | null;
  pages: WikiTree;
  userId: string;
}) {
  async function handleInitialize() {
    "use server";
    try {
      const created = await createWikiDraft({ id: pageId, parentId });
      return {
        id: created.id,
        parentId: created.parentId,
        title: created.title,
        icon: created.icon,
        content: created.content,
        version: created.version,
        contentGeneration: 0,
        updatedAt: new Date(created.updatedAt).toISOString(),
      };
    } catch (error: unknown) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function handleCheckForUpdate(currentVersion: number) {
    "use server";
    const latest = await getOwnWikiDraft(pageId);
    if (!latest || latest.version === currentVersion) return null;
    return {
      id: latest.id,
      parentId: latest.parentId,
      title: latest.title,
      icon: latest.icon,
      content: latest.content,
      version: latest.version,
      contentGeneration: 0,
      updatedAt: new Date(latest.updatedAt).toISOString(),
    };
  }

  async function handleSave(data: {
    title: string;
    icon?: string | null;
    content: string;
    editSummary?: string;
    parentId?: string | null;
    expectedVersion?: number;
    expectedContentGeneration?: number;
    expectedUpdatedAt?: string;
    baseTitle?: string;
    baseIcon?: string | null;
    baseContent?: string;
    baseParentId?: string | null;
  }) {
    "use server";
    try {
      const updated = await updateWikiDraft({
        pageId,
        title: data.title,
        icon: data.icon,
        content: data.content,
        parentId: data.parentId,
        expectedVersion: data.expectedVersion!,
        baseTitle: data.baseTitle,
        baseIcon: data.baseIcon,
        baseContent: data.baseContent,
        baseParentId: data.baseParentId,
      });
      if ("conflict" in updated) return updated;
      return {
        id: updated.id,
        parentId: updated.parentId,
        title: updated.title,
        icon: updated.icon,
        content: updated.content,
        version: updated.version,
        contentGeneration: 0,
        updatedAt: new Date(updated.updatedAt).toISOString(),
      };
    } catch (error: unknown) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function handlePublish() {
    "use server";
    try {
      const published = await publishWikiDraft(pageId);
      return {
        id: published.id,
        parentId: published.parentId,
        title: published.title,
        icon: published.icon,
        content: published.content,
        version: published.version,
        contentGeneration: published.contentGeneration,
        updatedAt: new Date(published.updatedAt).toISOString(),
      };
    } catch (error: unknown) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function handleDelete() {
    "use server";
    await deleteWikiDraft(pageId);
  }

  return (
    <WikiEditorLazy
      mode="edit"
      draftMode
      userId={userId}
      pageId={pageId}
      initialTitle={draft?.title}
      initialIcon={draft?.icon}
      initialValue={draft ? parseContent(draft.content) : undefined}
      parentId={draft?.parentId ?? parentId}
      expectedVersion={draft?.version}
      expectedUpdatedAt={
        draft ? new Date(draft.updatedAt).toISOString() : undefined
      }
      linkablePages={pages.map((page) => ({
        id: page.id,
        title: page.title,
        icon: page.icon,
      }))}
      canDelete
      onDelete={handleDelete}
      onCheckForUpdate={handleCheckForUpdate}
      onInitialize={draft ? undefined : handleInitialize}
      onPublish={handlePublish}
      onSubmit={handleSave}
    />
  );
}
