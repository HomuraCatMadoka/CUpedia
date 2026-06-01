import { requireEditorOrRedirect } from "@/lib/auth-guard";
import { createWikiPage, getWikiTree } from "@/lib/wiki-actions";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";

export default async function NewWikiPage() {
  await requireEditorOrRedirect();
  const pages = await getWikiTree();

  async function handleCreate(data: {
    slug: string;
    title: string;
    content: string;
    parentId?: string | null;
  }) {
    "use server";
    try {
      const page = await createWikiPage(data);
      return { slug: page.slug };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return (
    <>
      <SidebarToggle />
      <WikiSidebar pages={pages} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <h1 className="mb-6 text-2xl font-bold">新建页面</h1>
          <WikiEditor
            mode="create"
            linkablePages={pages.map((p) => ({
              id: p.id,
              slug: p.slug,
              title: p.title,
            }))}
            onSubmit={handleCreate}
          />
        </div>
      </div>
    </>
  );
}
