import Link from "next/link";
import { searchWikiPages, getWikiTree } from "@/lib/wiki-actions";
import { WikiSidebar } from "@/components/layout/wiki-sidebar";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [results, pages] = await Promise.all([
    q ? searchWikiPages(q) : [],
    getWikiTree(),
  ]);

  return (
    <>
      <SidebarToggle />
      <WikiSidebar pages={pages} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[var(--content-max-width)] space-y-4 px-6 py-6">
          <h1 className="text-2xl font-bold">搜索 Wiki</h1>
          <form className="flex gap-2">
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="搜索页面..."
              className="flex-1"
            />
            <Button type="submit">搜索</Button>
          </form>
          {q && (
            <p className="text-sm text-muted-foreground">
              找到 {results.length} 个结果
            </p>
          )}
          <div className="space-y-2">
            {results.map((r) => (
              <Link
                key={r.id}
                href={`/wiki/${r.slug}`}
                className="block rounded-lg border p-3 hover:bg-secondary/50"
              >
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">/{r.slug}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
