import { notFound, redirect } from "next/navigation";
import { requireEditorOrRedirect } from "@/lib/auth-guard";
import {
  getWikiPageForEdit,
  getWikiTree,
  updateWikiPage,
} from "@/lib/wiki-actions";
import { getDiscussions } from "@/lib/discussion-actions";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { parseContent } from "@/lib/plate-utils";
import { stripTitleHeading } from "@/lib/headings";
import { resolveWikiLinkUrls } from "@/lib/wiki-links";

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

export default async function EditWikiPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  await requireEditorOrRedirect();
  const { slug: slugParts } = await params;
  const identifier = slugParts.map(decodeURIComponent).join("/");
  const [page, pages] = await Promise.all([
    getWikiPageForEdit(identifier),
    getWikiTree(),
  ]);
  if (!page) notFound();
  if (page.id !== identifier) redirect(`/wiki/edit/${page.id}`);
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
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
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
        .filter((p) => !excludedParentIds.has(p.id))
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          icon: p.icon,
        }))}
      initialDiscussions={discussions}
      onSubmit={handleUpdate}
    />
  );
}
