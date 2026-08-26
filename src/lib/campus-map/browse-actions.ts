"use server";

import { readCampusMapBrowse } from "./browse-projection";
import {
  projectCampusMapAmapPoiCard,
  type CampusMapAmapPoiInput,
} from "./amap-browse-projection";
import {
  listCampusMapBrowseBuildings,
  listCampusMapCurrentPlaces,
  resolveCampusMapProviderSelection,
} from "./fact-store";

/** Public Current-facts projection used by map, search, and Building cards. */
export async function loadCampusMapBrowseProjection() {
  return readCampusMapBrowse({
    listBuildings: listCampusMapBrowseBuildings,
    listCurrentPlaces: listCampusMapCurrentPlaces,
  });
}

/** Returns one linked or transient AMap card without exposing mapping rules. */
export async function loadCampusMapAmapPoiCard(input: CampusMapAmapPoiInput) {
  const projectionPromise = loadCampusMapBrowseProjection();
  const mappingPromise = input.providerObjectId
    ? resolveCampusMapProviderSelection("amap", input.providerObjectId)
    : Promise.resolve(null);
  const [projection, mapping] = await Promise.all([
    projectionPromise,
    mappingPromise,
  ]);
  return projectCampusMapAmapPoiCard(projection, input, mapping);
}
