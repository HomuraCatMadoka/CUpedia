import type { Metadata } from "next";

import { CampusRouteView } from "@/components/campus-transport/campus-route-view";
import { toCampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import { getChampionCampusBusRoute } from "@/lib/campus-transport/prediction-model-cache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "2 新聯線 | CUpedia 校巴",
  description: "查看 CUHK 2 號校巴沿途站點與測試預計到站時間。",
  robots: { follow: false, index: false },
};

export default async function Route2Page() {
  const route = await getChampionCampusBusRoute("2");
  if (!route) return null;
  // This route is force-dynamic and the timestamp seeds a client-side clock.
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();
  return (
    <CampusRouteView
      route={toCampusBusPassengerRoute(route)}
      initialNow={initialNow}
    />
  );
}
