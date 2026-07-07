import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  getWikiPage,
  getWikiTree,
  deleteWikiPage,
  getBacklinks,
} from "@/lib/wiki-actions";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { WikiRenderer } from "@/components/wiki/wiki-renderer";
import { WikiStaticContent } from "@/components/wiki/wiki-static-content";
import { getViewerEditContext } from "@/lib/auth-guard";
import { getDiscussions } from "@/lib/discussion-actions";
import { extractHeadings, stripTitleHeading } from "@/lib/headings";
import { parseContent } from "@/lib/plate-utils";
import { Backlinks } from "@/components/wiki/backlinks";

export default async function WikiReadPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugParts } = await params;
  const slug = slugParts.map(decodeURIComponent).join("/");
  const [page, pages, { user, canEdit }] = await Promise.all([
    getWikiPage(slug),
    getWikiTree(),
    getViewerEditContext(),
  ]);

  if (!page) notFound();

  const headings = extractHeadings(page.content);
  const plateValue = stripTitleHeading(parseContent(page.content), page.title);
  const [discussions, backlinks] = await Promise.all([
    getDiscussions(page.id),
    getBacklinks(page.id),
  ]);

  const parentPage = page.parentId
    ? pages.find((p) => p.id === page.parentId)
    : undefined;

  return (
    <>
      <SidebarToggle canEdit={canEdit} />
      {/* The sidebar shows the TOC here, not the tree — only ship the tree
          for the no-headings fallback. WikiSidebar is a client component, so
          its props land in every navigation's RSC payload (#136). */}
      <WikiSidebar
        pages={headings.length > 0 ? undefined : pages}
        currentPage={{
          title: page.title,
          slug: slug,
          parentTitle: parentPage?.title,
          parentSlug: parentPage?.slug,
        }}
        headings={headings}
      />
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
              {canEdit && (
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
            最后编辑：
            {(page as { updatedByUser?: { nickname: string } }).updatedByUser
              ?.nickname ?? "未知用户"}{" "}
            · {new Date(page.updatedAt).toLocaleDateString("zh-CN")}
          </div>
          <div className="mt-6 border-t pt-6">
            <WikiRenderer
              pageId={page.id}
              discussions={discussions}
              canComment={!!user}
            >
              <WikiStaticContent value={plateValue} />
            </WikiRenderer>
            <Backlinks links={backlinks} />
          </div>
        </div>
      </div>
    </>
  );
}
