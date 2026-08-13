import type { Metadata } from "next";

import { CampusBusHome } from "@/components/campus-transport/campus-bus-home";
import { toCampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import { campusBusModelOperationsEnabled } from "@/lib/campus-transport/model-operations";
import { getChampionCampusBusRoutes } from "@/lib/campus-transport/prediction-model-cache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "校巴 | CUpedia",
  description: "查看香港中文大學校巴的今日班次與測試預計到站時間。",
  robots: { follow: false, index: false },
};

export default async function CampusBusPage() {
  const campusBusRoutes = (await getChampionCampusBusRoutes()).map(
    toCampusBusPassengerRoute,
  );
  const modelOperationsEnabled = campusBusModelOperationsEnabled();
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();
  return (
    <main className="min-h-full w-full min-w-0 flex-1 bg-[#f5f3f7] px-0 py-0 sm:px-4 sm:py-6 dark:bg-background">
      <CampusBusHome
        initialNow={initialNow}
        modelOperationsEnabled={modelOperationsEnabled}
        routes={campusBusRoutes}
      />
    </main>
  );
}
