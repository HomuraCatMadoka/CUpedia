import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CampusRouteView } from "@/components/campus-transport/campus-route-view";
import { toCampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import {
  campusBusRoutes,
  getCampusBusRoute,
} from "@/lib/campus-transport/routes-data";
import { getChampionCampusBusRoute } from "@/lib/campus-transport/prediction-model-cache";

export const revalidate = 300;

type RoutePageProps = {
  params: Promise<{ routeId: string }>;
};

export function generateStaticParams() {
  return campusBusRoutes
    .filter((route) => route.slug !== "2")
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
  if (routeId.toLowerCase() === "1a") {
    redirect("/campus-bus/1");
  }
  if (routeId.toLowerCase() === "1b") {
    redirect("/campus-bus?routeRetired=1b");
  }
  const route = await getChampionCampusBusRoute(routeId);
  if (!route || route.slug === "2") notFound();

  // The client immediately replaces this cached timestamp with the live clock.
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();
  return (
    <CampusRouteView
      route={toCampusBusPassengerRoute(route)}
      initialNow={initialNow}
    />
  );
}
