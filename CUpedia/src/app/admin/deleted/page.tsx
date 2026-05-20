import { getDeletedPages, restoreWikiPage } from "@/lib/wiki-actions";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";

export default async function DeletedPagesPage() {
  const pages = await getDeletedPages();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">已删除页面</h1>
      {pages.length === 0 ? (
        <p className="text-muted-foreground">没有已删除的页面。</p>
      ) : (
        <div className="space-y-2">
          {pages.map((page) => (
            <div key={page.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{page.title}</p>
                <p className="text-xs text-muted-foreground">
                  /{page.slug} · 删除于 {page.deletedAt?.toLocaleString("zh-CN")}
                </p>
              </div>
              <form
                action={async () => {
                  "use server";
                  await restoreWikiPage(page.id);
                  redirect("/admin/deleted");
                }}
              >
                <Button variant="outline" size="sm" type="submit">
                  恢复
                </Button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
