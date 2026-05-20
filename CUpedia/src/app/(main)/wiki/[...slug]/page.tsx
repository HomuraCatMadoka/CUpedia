import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getWikiPage, getWikiTree, deleteWikiPage } from "@/lib/wiki-actions";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { WikiRenderer } from "@/components/wiki/wiki-renderer";
import { getOptionalUser } from "@/lib/auth-guard";

export default async function WikiReadPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugParts } = await params;
  const slug = slugParts.map(decodeURIComponent).join("/");
  const [page, pages, user] = await Promise.all([
    getWikiPage(slug),
    getWikiTree(),
    getOptionalUser(),
  ]);

  if (!page) notFound();

  return (
    <>
      <SidebarToggle />
      <WikiSidebar pages={pages} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-6">
          <Breadcrumb pages={pages} currentSlug={slug} />
          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold">{page.title}</h1>
            <div className="flex shrink-0 gap-2">
              <Link href={`/wiki/history/${slug}`}>
                <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground hover:bg-accent">
                  历史
                </span>
              </Link>
              {user && (
                <Link href={`/wiki/edit/${slug}`}>
                  <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground hover:bg-accent">
                    编辑
                  </span>
                </Link>
              )}
              {user?.role === "admin" && (
                <form
                  action={async () => {
                    "use server";
                    await deleteWikiPage(page!.id);
                    redirect("/wiki");
                  }}
                >
                  <button
                    type="submit"
                    className="inline-block rounded-full bg-secondary px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    删除
                  </button>
                </form>
              )}
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            最后编辑：{(page as any).updatedByUser?.nickname ?? "未知用户"} ·{" "}
            {page.updatedAt.toLocaleDateString("zh-CN")}
          </div>
          <div className="mt-6 border-t pt-6">
            <WikiRenderer content={page.content} />
          </div>
        </div>
      </div>
    </>
  );
}
