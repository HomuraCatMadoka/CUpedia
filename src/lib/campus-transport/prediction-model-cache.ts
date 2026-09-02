import { unstable_cache } from "next/cache";

import { campusBusModelOperationsEnabled } from "@/lib/campus-transport/model-operations";
import { getChampionCampusBusRoutes as readChampionCampusBusRoutes } from "@/lib/campus-transport/prediction-model-store";
import { campusBusRoutes } from "@/lib/campus-transport/routes-data";
import { getCampusBusRoute } from "@/lib/campus-transport/routes-data";

const CAMPUS_BUS_ROUTE_CACHE_SCHEMA_VERSION = 2;

async function readReviewedCampusBusRoutes() {
  try {
    return await readChampionCampusBusRoutes();
  } catch {
    return campusBusRoutes;
  }
}

const getCachedReviewedCampusBusRoutes = unstable_cache(
  readReviewedCampusBusRoutes,
  [`campus-bus-champion-routes-v${CAMPUS_BUS_ROUTE_CACHE_SCHEMA_VERSION}`],
  { revalidate: 300, tags: ["campus-bus-model"] },
);

export async function getChampionCampusBusRoutes() {
  if (!campusBusModelOperationsEnabled()) return campusBusRoutes;
  return getCachedReviewedCampusBusRoutes();
}

export async function getChampionCampusBusRoute(routeId: string) {
  const canonicalRoute = getCampusBusRoute(routeId);
  if (!canonicalRoute) return undefined;
  const routes = await getChampionCampusBusRoutes();
  return routes.find((route) => route.routeId === canonicalRoute.routeId);
}
