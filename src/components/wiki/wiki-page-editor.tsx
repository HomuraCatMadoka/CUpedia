import { getDiscussions } from "@/lib/discussion-actions";
import { getWikiPageForEdit, getWikiTree } from "@/lib/wiki-actions";
import type { WikiDraft } from "@/lib/wiki-draft-actions";
import { parseContent } from "@/lib/plate-utils";
import {
  checkPrivateWikiDraftEditorUpdate,
  checkWikiPageEditorUpdate,
  deletePrivateWikiDraftFromEditor,
  deleteWikiPageFromEditor,
  initializePrivateWikiDraft,
  publishPrivateWikiDraftFromEditor,
  savePrivateWikiDraftFromEditor,
  submitWikiPageEditorUpdate,
} from "@/lib/wiki-editor-actions";
import { toWikiEditorValue } from "@/lib/wiki-editor-projection";
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
  const childPageIds = childPages.map((child) => child.id);
  const handleCheckForUpdate = checkWikiPageEditorUpdate.bind(null, pageId);
  const handleUpdate = submitWikiPageEditorUpdate.bind(null, {
    pageId,
  });
  const handleDelete = deleteWikiPageFromEditor.bind(null, pageId);

  return (
    <WikiEditorLazy
      mode="edit"
      userId={userId}
      pageId={pageId}
      initialTitle={page.title}
      initialIcon={page.icon}
      initialValue={toWikiEditorValue(page, childPageIds)}
      initialHiddenChildPageIds={childPageIds}
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
  const handleInitialize = initializePrivateWikiDraft.bind(
    null,
    pageId,
    parentId,
  );
  const handleCheckForUpdate = checkPrivateWikiDraftEditorUpdate.bind(
    null,
    pageId,
  );
  const handleSave = savePrivateWikiDraftFromEditor.bind(null, pageId);
  const handlePublish = publishPrivateWikiDraftFromEditor.bind(null, pageId);
  const handleDelete = deletePrivateWikiDraftFromEditor.bind(null, pageId);

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
