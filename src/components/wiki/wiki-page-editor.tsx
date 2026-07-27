import { redirect } from "next/navigation";
import { getDiscussions } from "@/lib/discussion-actions";
import {
  deleteWikiPage,
  getWikiPageForEdit,
  getWikiTree,
  updateWikiPage,
} from "@/lib/wiki-actions";
import { stripTitleHeading } from "@/lib/headings";
import { parseContent } from "@/lib/plate-utils";
import { resolveWikiLinkUrls } from "@/lib/wiki-links";
import { WikiEditor } from "@/components/wiki/wiki-editor";

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
  canDelete = false,
}: {
  page: EditablePage;
  pages: WikiTree;
  canDelete?: boolean;
}) {
  const pageId = page.id;
  const pageSlug = page.slug;
  const discussions = await getDiscussions(pageId);
  const excludedParentIds = collectDescendantIds(pages, pageId);

  async function handleUpdate(data: {
    slug: string;
    title: string;
    icon?: string | null;
    content: string;
    editSummary?: string;
    parentId?: string | null;
    expectedVersion?: number;
    expectedUpdatedAt?: string;
    baseTitle?: string;
    baseIcon?: string | null;
    baseContent?: string;
    baseSlug?: string;
    baseParentId?: string | null;
  }) {
    "use server";
    try {
      const updated = await updateWikiPage({
        pageId,
        slug: pageSlug,
        nextSlug: data.slug,
        title: data.title,
        icon: data.icon,
        content: data.content,
        editSummary: data.editSummary,
        parentId: data.parentId,
        expectedVersion: data.expectedVersion!,
        expectedUpdatedAt: data.expectedUpdatedAt!,
        baseTitle: data.baseTitle,
        baseIcon: data.baseIcon,
        baseContent: data.baseContent,
        baseSlug: data.baseSlug,
        baseParentId: data.baseParentId,
      });
      if ("conflict" in updated) {
        return {
          conflict: true as const,
          theirContent: updated.theirContent,
          theirTitle: updated.theirTitle,
          theirIcon: updated.theirIcon,
          theirSlug: updated.theirSlug,
          theirParentId: updated.theirParentId,
          theirVersion: updated.theirVersion,
          theirUpdatedAt: updated.theirUpdatedAt,
        };
      }
      return {
        id: updated.id,
        slug: updated.slug,
        parentId: updated.parentId,
        title: updated.title,
        icon: updated.icon,
        content: updated.content,
        version: updated.version,
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
    redirect("/wiki");
  }

  return (
    <WikiEditor
      mode="edit"
      pageId={pageId}
      initialTitle={page.title}
      initialIcon={page.icon}
      initialValue={stripTitleHeading(
        resolveWikiLinkUrls(parseContent(page.content), pages),
        page.title,
      )}
      initialSlug={page.slug}
      parentId={page.parentId}
      expectedVersion={page.version}
      expectedUpdatedAt={new Date(page.updatedAt).toISOString()}
      linkablePages={pages
        .filter((candidate) => !excludedParentIds.has(candidate.id))
        .map((candidate) => ({
          id: candidate.id,
          slug: candidate.slug,
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
