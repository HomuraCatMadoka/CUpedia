import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  getWikiPage,
  getWikiPageForEdit,
  getWikiTree,
  deleteWikiPage,
  getBacklinks,
} from "@/lib/wiki-actions";
import { PageToc } from "@/components/layout/page-toc";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { WikiRenderer } from "@/components/wiki/wiki-renderer";
import { WikiStaticContent } from "@/components/wiki/wiki-static-content";
import { getViewerEditContext } from "@/lib/auth-guard";
import { getDiscussions } from "@/lib/discussion-actions";
import { extractHeadings, stripTitleHeading } from "@/lib/headings";
import { parseContent } from "@/lib/plate-utils";
import { Backlinks } from "@/components/wiki/backlinks";
import { resolveWikiLinkUrls } from "@/lib/wiki-links";
import { getWikiDisplayTitle } from "@/lib/wiki-title";

export default async function WikiReadPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugParts } = await params;
  const identifier = slugParts.map(decodeURIComponent).join("/");
  const [page, pages, { user, canEdit }] = await Promise.all([
    getWikiPage(identifier),
    getWikiTree(),
    getViewerEditContext(),
  ]);

  if (!page) notFound();
  if (page.id !== identifier) redirect(`/wiki/${page.id}`);

  if (canEdit) {
    const { WikiPageEditor } =
      await import("@/components/wiki/wiki-page-editor");
    const editablePage = await getWikiPageForEdit(page.id);
    if (!editablePage) notFound();
    return (
      <WikiPageEditor
        page={editablePage}
        pages={pages}
        canDelete={user?.role === "admin"}
      />
    );
  }

  const headings = extractHeadings(page.content);
  const plateValue = stripTitleHeading(
    resolveWikiLinkUrls(parseContent(page.content), pages),
    page.title,
  );
  const [discussions, backlinks] = await Promise.all([
    getDiscussions(page.id),
    getBacklinks(page.id),
  ]);

  const parentPage = page.parentId
    ? pages.find((p) => p.id === page.parentId)
    : undefined;

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-6">
          <Breadcrumb pages={pages} currentPageId={page.id} />
          {page.icon && (
            <div
              data-testid="wiki-page-hero-icon"
              aria-hidden="true"
              className="mt-4 mb-2 text-[56px] leading-none md:text-[64px]"
            >
              {page.icon}
            </div>
          )}
          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold">
              {getWikiDisplayTitle(page.title)}
            </h1>
            <div className="flex shrink-0 gap-2">
              <Link href={`/wiki/history/${page.id}`}>
                <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground hover:bg-accent">
                  历史
                </span>
              </Link>
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
      {/* Per-page TOC as its own right column, coexisting with the layout's
          tree. Hidden below lg — three columns don't fit narrow screens, so the
          TOC (a wide-screen reading aid) drops out there. See ADR 0010. */}
      {headings.length > 0 && (
        <nav
          className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[var(--toc-width)] shrink-0 overflow-y-auto border-l bg-[var(--sidebar-bg)] lg:block"
          style={{ borderColor: "var(--sidebar-border-color)" }}
        >
          <PageToc
            headings={headings}
            pageTitle={page.title}
            parentTitle={parentPage?.title}
            parentPageId={parentPage?.id}
          />
        </nav>
      )}
    </>
  );
}
