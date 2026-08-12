import type { Metadata } from "next";
import Link from "next/link";
import { BusFrontIcon, FlaskConicalIcon } from "lucide-react";

import { CampusBusRouteList } from "@/components/campus-transport/campus-bus-route-list";
import { getChampionCampusBusRoutes } from "@/lib/campus-transport/prediction-model-cache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "校巴 | CUpedia",
  description: "查看香港中文大學校巴的今日班次與測試預計到站時間。",
  robots: { follow: false, index: false },
};

export default async function CampusBusPage() {
  const campusBusRoutes = await getChampionCampusBusRoutes();
  return (
    <main className="min-h-full w-full min-w-0 flex-1 bg-[#f5f3f7] px-0 py-0 sm:px-4 sm:py-6 dark:bg-background">
      <section className="w-full overflow-hidden bg-background shadow-sm ring-1 ring-black/5 sm:rounded-2xl">
        <header className="flex items-center justify-between gap-4 bg-[#5b2a73] px-5 py-7 text-white sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-white/12">
              <BusFrontIcon className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">中大校巴</h1>
              <p className="mt-0.5 text-sm text-white/78">
                今日班次與預計到站時間
              </p>
            </div>
          </div>
          <Link
            href="/campus-bus/lab"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <FlaskConicalIcon className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">模型實驗室</span>
            <span className="sm:hidden">實驗室</span>
          </Link>
        </header>

        {/* This route is force-dynamic and seeds the client-side status clock. */}
        {/* eslint-disable-next-line react-hooks/purity */}
        <CampusBusRouteList routes={campusBusRoutes} initialNow={Date.now()} />
      </section>
    </main>
  );
}
