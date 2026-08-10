"use server";

import {
  deleteWikiPage,
  getWikiPageForEdit,
  getWikiTree,
  updateWikiPage,
} from "./wiki-actions";
import {
  createWikiDraft,
  deleteWikiDraft,
  getOwnWikiDraft,
  publishWikiDraft,
  updateWikiDraft,
} from "./wiki-draft-actions";
import {
  normalizeWikiEditorHiddenChildPageIds,
  restoreWikiEditorContentProjection,
  toWikiEditorValue,
} from "./wiki-editor-projection";

export interface WikiEditorSubmission {
  title: string;
  icon: string | null;
  content: string;
  editSummary?: string;
  submissionId: string;
  parentId: string | null;
  expectedVersion: number;
  expectedContentGeneration: number;
  expectedUpdatedAt: string;
  baseTitle: string;
  baseIcon: string | null;
  baseContent: string;
  baseParentId: string | null;
  hiddenChildPageIds: string[];
}

type WikiTree = Awaited<ReturnType<typeof getWikiTree>>;

function serializeWikiPageForEditor(
  page: NonNullable<Awaited<ReturnType<typeof getWikiPageForEdit>>>,
  childPageIds: string[],
) {
  return {
    id: page.id,
    parentId: page.parentId,
    title: page.title,
    icon: page.icon,
    content: JSON.stringify(toWikiEditorValue(page, childPageIds)),
    version: page.version,
    contentGeneration: page.contentGeneration,
    updatedAt: new Date(page.updatedAt).toISOString(),
    hiddenChildPageIds: normalizeWikiEditorHiddenChildPageIds(childPageIds),
  };
}

export async function checkWikiPageEditorUpdate(
  pageId: string,
  currentVersion: number,
) {
  const latest = await getWikiPageForEdit(pageId);
  if (!latest || latest.version === currentVersion) return null;
  const latestTree = await getWikiTree();
  const childPageIds = latestTree
    .filter((candidate) => candidate.parentId === pageId)
    .map((child) => child.id);
  return serializeWikiPageForEditor(latest, childPageIds);
}

export async function submitWikiPageEditorUpdate(
  context: {
    pageId: string;
  },
  data: WikiEditorSubmission,
) {
  const { pageId } = context;
  try {
    const hiddenChildPageIds = normalizeWikiEditorHiddenChildPageIds(
      data.hiddenChildPageIds ?? [],
    );
    const submissionPayload = data.submissionId
      ? { pageId, ...data, hiddenChildPageIds }
      : undefined;
    const storedPage = await getWikiPageForEdit(pageId);
    if (!storedPage) throw new Error("Page not found");
    const restoreProjection = (content: string) =>
      restoreWikiEditorContentProjection(
        storedPage.content,
        content,
        hiddenChildPageIds,
      );
    const updated = await updateWikiPage(
      {
        pageId,
        title: data.title,
        icon: data.icon,
        content: restoreProjection(data.content),
        editSummary: data.editSummary,
        submissionId: data.submissionId,
        parentId: data.parentId,
        expectedVersion: data.expectedVersion,
        expectedContentGeneration: data.expectedContentGeneration,
        expectedUpdatedAt: data.expectedUpdatedAt,
        baseTitle: data.baseTitle,
        baseIcon: data.baseIcon,
        baseContent: restoreProjection(data.baseContent),
        baseParentId: data.baseParentId,
      },
      { submissionPayload },
    );
    // The mutation is already authoritative. Projection enrichment is
    // best-effort and cannot relabel the committed write as failed.
    const latestTree = await getWikiTree().catch(() => null as WikiTree | null);
    const latestChildPageIds = latestTree
      ? latestTree
          .filter((candidate) => candidate.parentId === pageId)
          .map((child) => child.id)
      : hiddenChildPageIds;
    if ("conflict" in updated) {
      return {
        conflict: true as const,
        theirContent: JSON.stringify(
          toWikiEditorValue(
            { title: updated.theirTitle, content: updated.theirContent },
            latestChildPageIds,
          ),
        ),
        theirTitle: updated.theirTitle,
        theirIcon: updated.theirIcon,
        theirParentId: updated.theirParentId,
        theirVersion: updated.theirVersion,
        theirContentGeneration: updated.theirContentGeneration,
        theirUpdatedAt: updated.theirUpdatedAt,
        theirHiddenChildPageIds:
          normalizeWikiEditorHiddenChildPageIds(latestChildPageIds),
      };
    }
    return serializeWikiPageForEditor(updated, latestChildPageIds);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteWikiPageFromEditor(pageId: string) {
  await deleteWikiPage(pageId);
}

function serializePrivateWikiDraft(
  draft: NonNullable<Awaited<ReturnType<typeof getOwnWikiDraft>>>,
) {
  return {
    id: draft.id,
    parentId: draft.parentId,
    title: draft.title,
    icon: draft.icon,
    content: draft.content,
    version: draft.version,
    contentGeneration: 0,
    updatedAt: new Date(draft.updatedAt).toISOString(),
  };
}

export async function initializePrivateWikiDraft(
  pageId: string,
  parentId: string | null,
) {
  try {
    return serializePrivateWikiDraft(
      await createWikiDraft({ id: pageId, parentId }),
    );
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function checkPrivateWikiDraftEditorUpdate(
  pageId: string,
  currentVersion: number,
) {
  const latest = await getOwnWikiDraft(pageId);
  if (!latest || latest.version === currentVersion) return null;
  return serializePrivateWikiDraft(latest);
}

export async function savePrivateWikiDraftFromEditor(
  pageId: string,
  data: WikiEditorSubmission,
) {
  try {
    const updated = await updateWikiDraft({
      pageId,
      title: data.title,
      icon: data.icon,
      content: data.content,
      parentId: data.parentId,
      expectedVersion: data.expectedVersion,
      baseTitle: data.baseTitle,
      baseIcon: data.baseIcon,
      baseContent: data.baseContent,
      baseParentId: data.baseParentId,
    });
    if ("conflict" in updated) return updated;
    return serializePrivateWikiDraft(updated);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function publishPrivateWikiDraftFromEditor(pageId: string) {
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
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deletePrivateWikiDraftFromEditor(pageId: string) {
  await deleteWikiDraft(pageId);
}
