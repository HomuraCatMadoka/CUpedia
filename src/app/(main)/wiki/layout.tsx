import { getWikiTree } from "@/lib/wiki-actions";
import { getViewerEditContext } from "@/lib/auth-guard";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";

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
  const [pages, { canEdit }] = await Promise.all([
    getWikiTree(),
    getViewerEditContext(),
  ]);

  return (
    <>
      <SidebarToggle canEdit={canEdit} />
      <WikiSidebar pages={pages} />
      {children}
    </>
  );
}
