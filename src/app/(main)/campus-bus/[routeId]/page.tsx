import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CampusRouteView } from "@/components/campus-transport/route-2-view";
import {
  campusBusRoutes,
  getCampusBusRoute,
} from "@/lib/campus-transport/routes-data";
import { getChampionCampusBusRoute } from "@/lib/campus-transport/prediction-model-cache";

export const dynamic = "force-dynamic";

type RoutePageProps = {
  params: Promise<{ routeId: string }>;
};

export function generateStaticParams() {
  return campusBusRoutes
    .filter((route) => route.routeId !== "2")
    .map((route) => ({ routeId: route.slug }));
}

export async function generateMetadata({
  params,
}: RoutePageProps): Promise<Metadata> {
  const { routeId } = await params;
  const route = getCampusBusRoute(routeId);
  if (!route) return {};
  return {
    title: `${route.routeNameZhHant} | CUpedia 校巴`,
    description: `查看 CUHK ${route.routeNameZhHant}沿途站點與測試預計到站時間。`,
    robots: { follow: false, index: false },
  };
}

export default async function CampusRoutePage({ params }: RoutePageProps) {
  const { routeId } = await params;
  const route = await getChampionCampusBusRoute(routeId);
  if (!route || route.routeId === "2") notFound();

  // This route is force-dynamic and the timestamp seeds a client-side clock.
  // eslint-disable-next-line react-hooks/purity
  return <CampusRouteView route={route} initialNow={Date.now()} />;
}
