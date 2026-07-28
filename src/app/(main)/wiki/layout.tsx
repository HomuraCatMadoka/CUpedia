import { getWikiTree } from "@/lib/wiki-actions";
import { getViewerEditContext } from "@/lib/auth-guard";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { WikiTreeProvider } from "@/components/wiki/wiki-tree-provider";
import { getOwnWikiDraftTree } from "@/lib/wiki-draft-actions";

// The page tree is common to every /wiki/* route, so it lives here in the wiki
// segment layout rather than in each page. App Router preserves a shared layout
// across sibling navigations, so the tree renders once on entry and is neither
// remounted nor re-serialized into each navigation's RSC payload (subsumes the
// #136/#138 payload optimization). See ADR 0010.
export default async function WikiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [publicPages, draftPages, { canEdit }] = await Promise.all([
    getWikiTree(),
    getOwnWikiDraftTree(),
    getViewerEditContext(),
  ]);
  const publicIds = new Set(publicPages.map((page) => page.id));
  const pages = [
    ...draftPages
      .filter((page) => !publicIds.has(page.id))
      .map((page, index) => ({
        ...page,
        sortOrder: publicPages.length + index,
      })),
    ...publicPages,
  ];

  return (
    <WikiTreeProvider initialPages={pages}>
      <SidebarToggle canEdit={canEdit} />
      <WikiSidebar pages={pages} canEdit={canEdit} />
      {children}
    </WikiTreeProvider>
  );
}
