import Link from "next/link";
import { getWikiTree } from "@/lib/wiki-actions";
import { getCategoryCards, getRecentPages } from "@/lib/wiki-homepage";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";

export default async function WikiIndexPage() {
  const [pages, categories, recentPages] = await Promise.all([
    getWikiTree(),
    getCategoryCards(),
    getRecentPages(),
  ]);

  return (
    <>
      <SidebarToggle />
      <WikiSidebar pages={pages} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-8">
          <h1 className="text-2xl font-bold">CUpedia</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            由同学们共同维护的校园生活指南
          </p>

          <Link
            href="/wiki/search"
            className="mt-6 flex items-center gap-2 rounded-lg border bg-[var(--sidebar-bg)] px-4 py-3 text-sm text-muted-foreground hover:border-foreground/20"
            style={{ borderColor: "var(--sidebar-border-color)" }}
          >
            🔍 搜索页面...
          </Link>

          {categories.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold">分类</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/wiki/${cat.slug}`}
                    className="rounded-lg border bg-[var(--sidebar-bg)] p-4 hover:border-foreground/20"
                    style={{ borderColor: "var(--sidebar-border-color)" }}
                  >
                    <div className="text-sm font-semibold">{cat.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {cat.childCount} 篇
                    </div>
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
                    className="flex items-center justify-between rounded-lg bg-secondary/50 px-4 py-3 hover:bg-secondary"
                  >
                    <div className="text-sm">{p.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {(p as { updatedByUser?: { nickname: string } })
                        .updatedByUser?.nickname ?? "未知"}{" "}
                      · {p.updatedAt.toLocaleDateString("zh-CN")}
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
