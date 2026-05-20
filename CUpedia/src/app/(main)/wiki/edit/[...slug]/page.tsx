import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-guard";
import { getWikiPage, getWikiTree, updateWikiPage } from "@/lib/wiki-actions";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";

export default async function EditWikiPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  await requireAuth();
  const { slug: slugParts } = await params;
  const slug = slugParts.map(decodeURIComponent).join("/");
  const [page, pages] = await Promise.all([
    getWikiPage(slug),
    getWikiTree(),
  ]);
  if (!page) notFound();

  async function handleUpdate(data: {
    slug: string;
    title: string;
    content: string;
    editSummary?: string;
    expectedUpdatedAt?: string;
  }) {
    "use server";
    try {
      const updated = await updateWikiPage({
        slug: data.slug,
        title: data.title,
        content: data.content,
        editSummary: data.editSummary,
        expectedUpdatedAt: data.expectedUpdatedAt!,
      });
      return { slug: updated.slug };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  return (
    <>
      <SidebarToggle />
      <WikiSidebar pages={pages} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <h1 className="mb-6 text-2xl font-bold">编辑：{page.title}</h1>
          <WikiEditor
            mode="edit"
            initialTitle={page.title}
            initialContent={page.content}
            initialSlug={page.slug}
            expectedUpdatedAt={page.updatedAt.toISOString()}
            onSubmit={handleUpdate}
          />
        </div>
      </div>
    </>
  );
}
