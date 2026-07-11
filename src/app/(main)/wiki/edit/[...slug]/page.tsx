import { notFound } from "next/navigation";
import { requireEditorOrRedirect } from "@/lib/auth-guard";
import {
  getWikiPageForEdit,
  getWikiTree,
  updateWikiPage,
} from "@/lib/wiki-actions";
import { getDiscussions } from "@/lib/discussion-actions";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { parseContent } from "@/lib/plate-utils";

export default async function EditWikiPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  await requireEditorOrRedirect();
  const { slug: slugParts } = await params;
  const slug = slugParts.map(decodeURIComponent).join("/");
  const [page, pages] = await Promise.all([
    getWikiPageForEdit(slug),
    getWikiTree(),
  ]);
  if (!page) notFound();
  const discussions = await getDiscussions(page.id);

  async function handleUpdate(data: {
    slug: string;
    title: string;
    content: string;
    editSummary?: string;
    expectedUpdatedAt?: string;
    baseContent?: string;
  }) {
    "use server";
    try {
      const updated = await updateWikiPage({
        slug: data.slug,
        title: data.title,
        content: data.content,
        editSummary: data.editSummary,
        expectedUpdatedAt: data.expectedUpdatedAt!,
        baseContent: data.baseContent,
      });
      if ("conflict" in updated) {
        return {
          conflict: true as const,
          theirContent: updated.theirContent,
          theirTitle: updated.theirTitle,
          theirUpdatedAt: updated.theirUpdatedAt,
        };
      }
      return {
        slug: updated.slug,
        updatedAt: new Date(updated.updatedAt).toISOString(),
      };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <h1 className="mb-6 text-2xl font-bold">编辑：{page.title}</h1>
        <WikiEditor
          mode="edit"
          pageId={page.id}
          initialTitle={page.title}
          initialValue={parseContent(page.content)}
          initialSlug={page.slug}
          expectedUpdatedAt={new Date(page.updatedAt).toISOString()}
          linkablePages={pages
            .filter((p) => p.id !== page.id)
            .map((p) => ({ id: p.id, slug: p.slug, title: p.title }))}
          initialDiscussions={discussions}
          onSubmit={handleUpdate}
        />
      </div>
    </div>
  );
}
