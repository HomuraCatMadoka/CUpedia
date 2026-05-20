import Link from "next/link";

type Revision = {
  id: string;
  title: string;
  editSummary: string | null;
  createdAt: Date;
  editedByUser: { nickname: string } | null;
};

export function RevisionList({
  revisions,
  slug,
}: {
  revisions: Revision[];
  slug: string;
}) {
  if (revisions.length === 0) {
    return <p className="text-muted-foreground">暂无编辑历史。</p>;
  }

  return (
    <div className="space-y-2">
      {revisions.map((rev, i) => (
        <div key={rev.id} className="flex items-center justify-between rounded border p-3">
          <div>
            <p className="text-sm font-medium">
              {rev.editedByUser?.nickname ?? "未知用户"}
            </p>
            <p className="text-xs text-muted-foreground">
              {rev.createdAt.toLocaleString("zh-CN")}
              {rev.editSummary && ` · ${rev.editSummary}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/wiki/history/${slug}?view=${rev.id}`}
              className="text-xs text-blue-600 hover:underline"
            >
              查看
            </Link>
            {i < revisions.length - 1 && (
              <Link
                href={`/wiki/history/${slug}?diff=${revisions[i + 1].id}&with=${rev.id}`}
                className="text-xs text-blue-600 hover:underline"
              >
                对比
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
