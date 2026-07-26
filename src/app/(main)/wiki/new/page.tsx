import { requireEditorOrRedirect } from "@/lib/auth-guard";
import { createWikiPage, getWikiTree } from "@/lib/wiki-actions";
import { WikiEditor } from "@/components/wiki/wiki-editor";

export default async function NewWikiPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  await requireEditorOrRedirect();
  const pages = await getWikiTree();
  const { parent } = await searchParams;
  const parentId =
    typeof parent === "string" && pages.some((page) => page.id === parent)
      ? parent
      : null;

  async function handleCreate(data: {
    slug: string;
    title: string;
    icon?: string | null;
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
    <WikiEditor
      mode="create"
      parentId={parentId}
      linkablePages={pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        icon: p.icon,
      }))}
      onSubmit={handleCreate}
    />
  );
}
