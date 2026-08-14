export const dynamic = "force-dynamic";

import Link from "next/link";

import { ProductUpdateMeta } from "@/components/product-updates/product-update-meta";
import { listPublicProductUpdates } from "@/lib/product-update-queries";

export default async function ProductUpdatesPage() {
  const updates = await listPublicProductUpdates();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 md:py-16">
      <header className="grid gap-5 border-b pb-8 md:grid-cols-[1fr_17rem] md:items-end md:gap-16">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          产品更新
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          了解 CUpedia 最近上线的新功能与体验改善。重要通知仍会在公告中心发布。
        </p>
      </header>

      {updates.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">暂无产品更新</p>
      ) : (
        <ol className="divide-y">
          {updates.map((update) => (
            <li key={update.id}>
              <Link
                href={`/updates/${update.id}`}
                className="group block rounded-md py-7 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <ProductUpdateMeta update={update} />
                <h2 className="mt-3 text-xl font-semibold tracking-tight group-hover:underline group-hover:underline-offset-4 md:text-2xl">
                  {update.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                  {update.summary}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
