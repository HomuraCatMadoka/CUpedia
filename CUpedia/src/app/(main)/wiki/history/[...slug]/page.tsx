import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getWikiPage,
  getWikiTree,
  getRevisions,
  getRevision,
  rollbackToRevision,
} from "@/lib/wiki-actions";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { RevisionList } from "@/components/wiki/revision-list";
import { RevisionDiff } from "@/components/wiki/revision-diff";
import { WikiRenderer } from "@/components/wiki/wiki-renderer";
import { Button } from "@/components/ui/button";
import { getOptionalUser } from "@/lib/auth-guard";
import { getWikiEditRole } from "@/lib/site-settings";
import { redirect } from "next/navigation";

function SidebarWrapper({
  pages,
  canEdit = true,
  children,
}: {
  pages: { id: string; slug: string; title: string; parentId: string | null }[];
  canEdit?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <SidebarToggle canEdit={canEdit} />
      <WikiSidebar pages={pages} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[var(--content-max-width)] space-y-4 px-6 py-6">
          {children}
        </div>
      </div>
    </>
  );
}

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ view?: string; diff?: string; with?: string }>;
}) {
  const { slug: slugParts } = await params;
  const slug = slugParts.map(decodeURIComponent).join("/");
  const sp = await searchParams;
  const [page, pages] = await Promise.all([getWikiPage(slug), getWikiTree()]);
  if (!page) notFound();

  const revisions = await getRevisions(page.id);
  const [user, editRole] = await Promise.all([
    getOptionalUser(),
    getWikiEditRole(),
  ]);

  const canEdit = !!user && (editRole === "user" || user.role === "admin");

  if (sp.view) {
    const rev = await getRevision(page.id, sp.view);
    if (!rev) notFound();

    async function handleRollback() {
      "use server";
      try {
        await rollbackToRevision(page!.id, sp.view!);
      } catch {
        redirect(`/wiki/history/${slug}?view=${sp.view}`);
      }
      redirect(`/wiki/${slug}`);
    }

    return (
      <SidebarWrapper pages={pages} canEdit={canEdit}>
        <Link
          href={`/wiki/history/${slug}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; 返回历史
        </Link>
        <h1 className="text-xl font-bold">历史版本：{rev.title}</h1>
        <p className="text-xs text-muted-foreground">
          {rev.createdAt.toLocaleString("zh-CN")}
        </p>
        {canEdit && (
          <form action={handleRollback}>
            <Button variant="outline" size="sm" type="submit">
              回滚到此版本
            </Button>
          </form>
        )}
        <WikiRenderer content={rev.content} />
      </SidebarWrapper>
    );
  }

  if (sp.diff && sp.with) {
    const [older, newer] = await Promise.all([
      getRevision(page.id, sp.diff),
      getRevision(page.id, sp.with),
    ]);
    if (!older || !newer) notFound();

    return (
      <SidebarWrapper pages={pages} canEdit={canEdit}>
        <Link
          href={`/wiki/history/${slug}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; 返回历史
        </Link>
        <h1 className="text-xl font-bold">版本对比</h1>
        <RevisionDiff
          oldText={older.content}
          newText={newer.content}
          oldLabel={older.createdAt.toLocaleString("zh-CN")}
          newLabel={newer.createdAt.toLocaleString("zh-CN")}
        />
      </SidebarWrapper>
    );
  }

  return (
    <SidebarWrapper pages={pages} canEdit={canEdit}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">编辑历史：{page.title}</h1>
        <Link href={`/wiki/${slug}`}>
          <Button variant="outline" size="sm">
            返回页面
          </Button>
        </Link>
      </div>
      <RevisionList revisions={revisions} slug={slug} />
    </SidebarWrapper>
  );
}
