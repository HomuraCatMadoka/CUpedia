import { unstable_cache } from "next/cache";

import { getChampionCampusBusRoutes as readChampionCampusBusRoutes } from "@/lib/campus-transport/prediction-model-store";
import { campusBusRoutes } from "@/lib/campus-transport/routes-data";

async function readPassengerCampusBusRoutes() {
  try {
    return await readChampionCampusBusRoutes();
  } catch {
    return campusBusRoutes;
  }
}

export const getChampionCampusBusRoutes = unstable_cache(
  readPassengerCampusBusRoutes,
  ["campus-bus-champion-routes-v1"],
  { revalidate: 300, tags: ["campus-bus-model"] },
);

export async function getChampionCampusBusRoute(routeId: string) {
  const routes = await getChampionCampusBusRoutes();
  return routes.find(
    (route) =>
      route.routeId.toLowerCase() === routeId.toLowerCase() ||
      route.slug.toLowerCase() === routeId.toLowerCase(),
  );
}
