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
  publishWikiDraft,
  updateWikiDraft,
  type WikiDraft,
} from "@/lib/wiki-draft-actions";
import { stripTitleHeading } from "@/lib/headings";
import { parseContent } from "@/lib/plate-utils";
import {
  resolveWikiLinkUrls,
  stripLegacyChildPageLinks,
} from "@/lib/wiki-links";
import { WikiEditorLazy } from "@/components/wiki/wiki-editor-lazy";

type EditablePage = NonNullable<Awaited<ReturnType<typeof getWikiPageForEdit>>>;
type WikiTree = Awaited<ReturnType<typeof getWikiTree>>;

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
      const updated = await updateWikiPage({
        pageId,
        title: data.title,
        icon: data.icon,
        content: data.content,
        editSummary: data.editSummary,
        parentId: data.parentId,
        expectedVersion: data.expectedVersion!,
        expectedContentGeneration: data.expectedContentGeneration!,
        expectedUpdatedAt: data.expectedUpdatedAt!,
        baseTitle: data.baseTitle,
        baseIcon: data.baseIcon,
        baseContent: data.baseContent,
        baseParentId: data.baseParentId,
      });
      if ("conflict" in updated) {
        return {
          conflict: true as const,
          theirContent: updated.theirContent,
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
        content: updated.content,
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
      initialValue={stripTitleHeading(
        resolveWikiLinkUrls(
          stripLegacyChildPageLinks(
            parseContent(page.content),
            new Set(childPages.map((child) => child.id)),
          ),
        ),
        page.title,
      )}
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
      onInitialize={draft ? undefined : handleInitialize}
      onPublish={handlePublish}
      onSubmit={handleSave}
    />
  );
}
