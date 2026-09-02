import type { Metadata } from "next";

import { CampusBusHome } from "@/components/campus-transport/campus-bus-home";
import { toCampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import { getChampionCampusBusRoutes } from "@/lib/campus-transport/prediction-model-cache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "校巴 | CUpedia",
  description: "查看香港中文大學校巴的今日班次與測試預計到站時間。",
  robots: { follow: false, index: false },
};

type CampusBusPageProps = {
  searchParams: Promise<{ routeRetired?: string | string[] }>;
};

export default async function CampusBusPage({
  searchParams,
}: CampusBusPageProps) {
  const { routeRetired } = await searchParams;
  const campusBusRoutes = (await getChampionCampusBusRoutes()).map(
    toCampusBusPassengerRoute,
  );
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();
  return (
    <main className="min-h-full w-full min-w-0 flex-1 bg-[#f5f3f7] px-0 py-0 sm:px-4 sm:py-6 dark:bg-background">
      {routeRetired === "1b" && (
        <div
          className="mx-auto mb-3 max-w-5xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:rounded-xl dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100"
          role="status"
        >
          1B 線已於 2026 年 9 月 1 日退役。請刷新路線目錄後重新選擇；新的 2S
          線不是 1B 線。
        </div>
      )}
      <CampusBusHome initialNow={initialNow} routes={campusBusRoutes} />
    </main>
  );
}
