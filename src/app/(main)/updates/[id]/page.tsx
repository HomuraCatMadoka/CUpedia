export const dynamic = "force-dynamic";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { ProductUpdateMeta } from "@/components/product-updates/product-update-meta";
import { getPublicProductUpdate } from "@/lib/product-update-queries";

export default async function ProductUpdateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const update = await getPublicProductUpdate(id);

  if (!update) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-balance">产品更新不存在</h1>
        <p className="mt-3 text-sm text-pretty text-muted-foreground">
          这条产品更新可能尚未公开，或链接无效。
        </p>
        <Link
          href="/updates"
          className="mt-6 inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          返回全部产品更新
        </Link>
      </div>
    );
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
      <Link
        href="/updates"
        className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        返回全部产品更新
      </Link>
      <header className="mt-7 border-b pb-8 md:mt-10">
        <ProductUpdateMeta update={update} />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance md:text-5xl">
          {update.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-pretty text-muted-foreground">
          {update.summary}
        </p>
      </header>
      <div className="mt-8 whitespace-pre-wrap text-base leading-8 md:text-lg md:leading-9">
        {update.content}
      </div>
    </article>
  );
}
