import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  getWikiPageState,
  getWikiPageForEdit,
  getWikiTree,
  deleteWikiPage,
  getBacklinks,
  restoreWikiPage,
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
import {
  resolveWikiLinkUrls,
  stripLegacyChildPageLinks,
} from "@/lib/wiki-links";
import { getWikiDisplayTitle } from "@/lib/wiki-title";
import { isCanonicalWikiPageId } from "@/lib/wiki-routes";
import { getOwnWikiDraft } from "@/lib/wiki-draft-actions";
import { WikiChildPages } from "@/components/wiki/wiki-child-pages";

function WikiPageTombstone({
  pageId,
  deletedAt,
  canRestore,
}: {
  pageId: string;
  deletedAt: Date | null;
  canRestore: boolean;
}) {
  return (
    <main className="flex-1 overflow-y-auto">
      <div
        data-testid="wiki-page-tombstone"
        className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center"
      >
        <p className="text-sm font-medium text-muted-foreground">CUpedia</p>
        <h1 className="mt-3 text-2xl font-semibold">页面已删除</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          这个页面已被移至回收站。指向它的链接会保留，恢复后会自动重新生效。
        </p>
        {deletedAt ? (
          <p className="mt-2 text-xs text-muted-foreground">
            删除于 {deletedAt.toLocaleString("zh-CN")}
          </p>
        ) : null}
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/wiki"
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            返回 Wiki
          </Link>
          {canRestore ? (
            <form
              action={async () => {
                "use server";
                await restoreWikiPage(pageId);
                redirect(`/wiki/${pageId}`);
              }}
            >
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
              >
                恢复页面
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default async function WikiReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string[] }>;
  searchParams: Promise<{ draft?: string; parent?: string }>;
}) {
  const { id: idParts } = await params;
  const draftParams = await searchParams;
  const identifier = idParts.map(decodeURIComponent).join("/");
  const [page, { user, canEdit }] = await Promise.all([
    getWikiPageState(identifier),
    getViewerEditContext(),
  ]);

  if (identifier === "new" && draftParams.draft === "1" && canEdit && user) {
    const id = crypto.randomUUID();
    const query = new URLSearchParams({ draft: "1" });
    if (
      typeof draftParams.parent === "string" &&
      isCanonicalWikiPageId(draftParams.parent)
    ) {
      query.set("parent", draftParams.parent);
    }
    redirect(`/wiki/${id}?${query}`);
  }

  if (!page) {
    const draft =
      canEdit && user && isCanonicalWikiPageId(identifier)
        ? await getOwnWikiDraft(identifier)
        : null;
    if (
      canEdit &&
      user &&
      isCanonicalWikiPageId(identifier) &&
      (draft || draftParams.draft === "1")
    ) {
      const parentId =
        draft?.parentId ??
        (typeof draftParams.parent === "string" &&
        isCanonicalWikiPageId(draftParams.parent)
          ? draftParams.parent
          : null);
      const { WikiDraftPageEditor } =
        await import("@/components/wiki/wiki-page-editor");
      return (
        <WikiDraftPageEditor
          pageId={identifier}
          parentId={parentId}
          draft={draft}
          pages={[]}
          userId={user.id}
        />
      );
    }
    notFound();
  }

  if (draftParams.draft === "1") {
    redirect(`/wiki/${page.id}`);
  }

  const pages = await getWikiTree();

  if (page.deletedAt) {
    return (
      <WikiPageTombstone
        pageId={page.id}
        deletedAt={page.deletedAt}
        canRestore={user?.role === "admin"}
      />
    );
  }

  if (canEdit) {
    const { WikiPageEditor } =
      await import("@/components/wiki/wiki-page-editor");
    const editablePage = await getWikiPageForEdit(page.id);
    if (!editablePage) notFound();
    return (
      <WikiPageEditor
        page={editablePage}
        pages={pages}
        userId={user!.id}
        canDelete={user?.role === "admin"}
      />
    );
  }

  const childPages = pages.filter(
    (candidate) => candidate.parentId === page.id,
  );
  const headings = extractHeadings(page.content);
  const plateValue = stripTitleHeading(
    resolveWikiLinkUrls(
      stripLegacyChildPageLinks(
        parseContent(page.content),
        new Set(childPages.map((child) => child.id)),
      ),
    ),
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
            <WikiChildPages pages={childPages} />
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
