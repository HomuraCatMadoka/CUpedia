import Link from "next/link";

export default function CampusMapNotFound() {
  return (
    <div className="w-full px-4 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border bg-card p-6">
        <h1 className="text-xl font-bold">找不到这条公开历史</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          编号可能有误，或这条记录从未公开。
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold"
          href="/campus-map/changesets"
        >
          查看最近编辑
        </Link>
      </div>
    </div>
  );
}
