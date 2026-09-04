"use server";

import { requireAuth } from "@/lib/auth-guard";
import { readCampusMapBrowse } from "@/lib/campus-map/browse-projection";
import {
  listCampusMapBrowseBuildings,
  listCampusMapCurrentPlaces,
} from "@/lib/campus-map/fact-store";
import { getCampusMapCurrentPlaceCoverViews } from "@/lib/campus-map/place-photos";
import { listCampusMapProviderMappings } from "@/lib/campus-map/provider-mapping-registry";

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

/**
 * Preloads exact AMap identities so a hotspot click never waits for a second
 * server request. An unavailable mapping read degrades to transient cards.
 */
export async function loadCampusMapAmapHotspotMappings() {
  await requireAuth();
  try {
    return await listCampusMapProviderMappings("amap");
  } catch {
    return [];
  }
}

/** Refreshes one category-card cover after a Place publish. */
export async function loadCampusMapPlaceCover(placeId: string) {
  await requireAuth();
  const covers = await getCampusMapCurrentPlaceCoverViews([placeId]);
  return covers[placeId] ?? null;
}
