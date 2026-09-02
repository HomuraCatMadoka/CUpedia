"use server";

import { requireAuth } from "@/lib/auth-guard";
import {
  projectCampusMapAmapPoiCard,
  type CampusMapAmapPoiInput,
} from "@/lib/campus-map/amap-browse-projection";
import { readCampusMapBrowse } from "@/lib/campus-map/browse-projection";
import {
  listCampusMapBrowseBuildings,
  listCampusMapCurrentPlaces,
} from "@/lib/campus-map/fact-store";
import { getCampusMapCurrentPlaceCoverViews } from "@/lib/campus-map/place-photos";
import { resolveCampusMapProviderSelection } from "@/lib/campus-map/provider-mapping-registry";

function readBrowseProjection() {
  return readCampusMapBrowse({
    listBuildings: listCampusMapBrowseBuildings,
    listCurrentPlaces: listCampusMapCurrentPlaces,
  });
}

/** Beta Current-facts projection used by map, search, and Building cards. */
export async function loadCampusMapBrowseProjection() {
  await requireAuth();
  return readBrowseProjection();
}

/** Refreshes one category-card cover after a Place publish. */
export async function loadCampusMapPlaceCover(placeId: string) {
  await requireAuth();
  const covers = await getCampusMapCurrentPlaceCoverViews([placeId]);
  return covers[placeId] ?? null;
}

/** Returns one linked or transient AMap card without exposing mapping rules. */
export async function loadCampusMapAmapPoiCard(input: CampusMapAmapPoiInput) {
  await requireAuth();
  const projectionPromise = readBrowseProjection();
  const mappingPromise = input.providerObjectId
    ? resolveCampusMapProviderSelection("amap", input.providerObjectId)
    : Promise.resolve(null);
  const [projection, mapping] = await Promise.all([
    projectionPromise,
    mappingPromise,
  ]);
  return projectCampusMapAmapPoiCard(projection, input, mapping);
}
