import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, FlaskConicalIcon } from "lucide-react";

import { ModelLab } from "@/components/campus-transport/model-lab";
import { requireAuth } from "@/lib/auth-guard";
import { getModelLabOverview } from "@/lib/campus-transport/model-experiment-store";
import { campusBusModelOperationsEnabled } from "@/lib/campus-transport/model-operations";
import { campusBusRoutes } from "@/lib/campus-transport/routes-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "校巴模型實驗室 | CUpedia",
  description: "使用匿名化到站資料比較中大校巴預測參數。",
  robots: { follow: false, index: false },
};

export default async function CampusBusModelLabPage() {
  if (!campusBusModelOperationsEnabled()) notFound();
  const user = await requireAuth();
  const overview = await getModelLabOverview(user);

  return (
    <div className="w-full min-w-0 flex-1 bg-[#f6f4f7] dark:bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/campus-bus"
          className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          返回校巴
        </Link>

        <header className="border-b border-[#5b2a73]/15 pb-7">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#5b2a73] text-white">
              <FlaskConicalIcon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                校巴模型實驗室
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                用匿名化到站資料調整參數並比較留出驗證集。實驗不會自動影響乘客看到的預測。
              </p>
            </div>
          </div>
        </header>

        <ModelLab
          initialOverview={{
            ...overview,
            champion: overview.champion
              ? {
                  ...overview.champion,
                  createdAt: overview.champion.createdAt.toISOString(),
                  promotedAt:
                    overview.champion.promotedAt?.toISOString() ?? null,
                }
              : null,
            coverage: {
              ...overview.coverage,
              firstArrivalAt:
                overview.coverage.firstArrivalAt?.toISOString() ?? null,
              lastArrivalAt:
                overview.coverage.lastArrivalAt?.toISOString() ?? null,
            },
            experiments: overview.experiments.map((experiment) => ({
              ...experiment,
              createdAt: experiment.createdAt.toISOString(),
              promotedAt: experiment.promotedAt?.toISOString() ?? null,
            })),
          }}
          isAdmin={user.role === "admin"}
          routes={campusBusRoutes.map((route) => ({
            id: route.routeId,
            name: route.routeNameZhHant,
          }))}
        />
      </div>
    </div>
  );
}
