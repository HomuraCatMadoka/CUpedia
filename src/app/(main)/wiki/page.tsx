export const dynamic = "force-dynamic";

import Link from "next/link";
import { getWikiTree } from "@/lib/wiki-actions";
import { getCategoryCards, getRecentPages } from "@/lib/wiki-homepage";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { Card, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getOptionalUser } from "@/lib/auth-guard";
import { getWikiEditRole } from "@/lib/site-settings";

export default async function WikiIndexPage() {
  const [pages, categories, recentPages, user, editRole] = await Promise.all([
    getWikiTree(),
    getCategoryCards(),
    getRecentPages(),
    getOptionalUser(),
    getWikiEditRole(),
  ]);

  const canEdit = !!user && (editRole === "user" || user?.role === "admin");

  return (
    <>
      <SidebarToggle canEdit={canEdit} />
      <WikiSidebar pages={pages} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-8">
          <h1 className="text-2xl font-bold">CUpedia</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            由同学们共同维护的校园生活指南
          </p>

          {categories.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold">分类</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/wiki/${cat.slug}`}
                    prefetch={false}
                  >
                    <Card
                      size="sm"
                      className="transition-colors hover:ring-foreground/20"
                    >
                      <CardHeader>
                        <CardTitle className="text-sm">{cat.title}</CardTitle>
                        <CardAction>
                          <Badge variant="secondary">{cat.childCount} 篇</Badge>
                        </CardAction>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {recentPages.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold">最近更新</h2>
              <div className="mt-3 space-y-2">
                {recentPages.map((p) => (
                  <Link
                    key={p.id}
                    href={`/wiki/${p.slug}`}
                    prefetch={false}
                    className="flex items-center justify-between rounded-lg bg-secondary/50 px-4 py-3 hover:bg-secondary"
                  >
                    <div className="text-sm">{p.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {(p as { updatedByUser?: { nickname: string } })
                        .updatedByUser?.nickname ?? "未知"}{" "}
                      · {new Date(p.updatedAt).toLocaleDateString("zh-CN")}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
