import { unstable_cache } from "next/cache";

import { campusBusModelOperationsEnabled } from "@/lib/campus-transport/model-operations";
import { getChampionCampusBusRoutes as readChampionCampusBusRoutes } from "@/lib/campus-transport/prediction-model-store";
import { campusBusRoutes } from "@/lib/campus-transport/routes-data";

async function readReviewedCampusBusRoutes() {
  try {
    return await readChampionCampusBusRoutes();
  } catch {
    return campusBusRoutes;
  }
}

const getCachedReviewedCampusBusRoutes = unstable_cache(
  readReviewedCampusBusRoutes,
  ["campus-bus-champion-routes-v1"],
  { revalidate: 300, tags: ["campus-bus-model"] },
);

export async function getChampionCampusBusRoutes() {
  if (!campusBusModelOperationsEnabled()) return campusBusRoutes;
  return getCachedReviewedCampusBusRoutes();
}

export async function getChampionCampusBusRoute(routeId: string) {
  const routes = await getChampionCampusBusRoutes();
  return routes.find(
    (route) =>
      route.routeId.toLowerCase() === routeId.toLowerCase() ||
      route.slug.toLowerCase() === routeId.toLowerCase(),
  );
}
