import Link from "next/link";
import { notFound } from "next/navigation";

import { CampusMapReadShell } from "@/components/campus-map/history-shell";
import { getCampusMapPlaceHistory } from "@/lib/campus-map/fact-store";

export const dynamic = "force-dynamic";

export default async function CampusMapPlacePage({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const { placeId } = await params;
  const history = await getCampusMapPlaceHistory(placeId, { limit: 1 });
  const latest = history.items[0];
  if (!latest) notFound();
  const name =
    latest.content.visibility === "public"
      ? latest.content.fact.name
      : `地点 ${placeId.slice(0, 8)}`;

  return (
    <CampusMapReadShell
      eyebrow="CAMPUS MAP PLACE"
      title={name}
      description="这是地点的公开只读卡片。"
    >
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="break-all font-mono text-xs text-muted-foreground">
          Place：{placeId}
        </p>
        {latest.status === "retired" ? (
          <p className="mt-3 text-sm font-semibold text-amber-700">
            此地点已停用
          </p>
        ) : null}
        {latest.status === "merged" && latest.mergedIntoPlaceId ? (
          <p className="mt-3 text-sm font-semibold text-amber-700">
            此地点已合并至
            <Link
              className="ml-1 underline"
              href={`/campus-map/places/${latest.mergedIntoPlaceId}`}
            >
              保留地点
            </Link>
          </p>
        ) : null}
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/campus-map/places/${placeId}/history`}
        >
          History · 查看修订历史
        </Link>
      </div>
    </CampusMapReadShell>
  );
}
