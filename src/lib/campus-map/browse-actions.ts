"use server";

import { readCampusMapBrowse } from "./browse-projection";
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

/** Provider IDs are lookup input only; the result contains canonical IDs. */
export async function resolveCampusMapProviderTarget(input: {
  provider: string;
  providerObjectId: string;
}) {
  return resolveCampusMapProviderSelection(
    input.provider,
    input.providerObjectId,
  );
}
