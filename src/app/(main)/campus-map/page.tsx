import type { Metadata } from "next";

import { CampusMapRuntime } from "@/components/campus-map/campus-map-runtime";
import { requireAuth } from "@/lib/auth-guard";
import {
  loadCampusMapAmapHotspotMappings,
  loadCampusMapBrowseProjection,
} from "@/lib/campus-map/browse-actions";
import { getCampusMapFactSchema } from "@/lib/campus-map/fact-store";
import { getCampusMapPlaceFeedbackSummaries } from "@/lib/campus-map/place-feedback";
import { getCampusMapCurrentPlaceCoverViews } from "@/lib/campus-map/place-photos";

export const metadata: Metadata = {
  title: "Campus Map",
};
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function encodeSearchParams(
  values: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  return params;
}

export default async function CampusMapPage({ searchParams }: PageProps) {
  const params = encodeSearchParams(await searchParams);
  const callbackUrl = `/campus-map${params.size ? `?${params.toString()}` : ""}`;
  await requireAuth(callbackUrl);
  const [factSchema, browseProjection, amapHotspotMappings] = await Promise.all(
    [
      getCampusMapFactSchema(),
      loadCampusMapBrowseProjection(),
      loadCampusMapAmapHotspotMappings(),
    ],
  );
  const placeIds = browseProjection.places.map((place) => place.placeId);
  const [feedbackSummaries, placeCovers] = await Promise.all([
    getCampusMapPlaceFeedbackSummaries(placeIds),
    getCampusMapCurrentPlaceCoverViews(placeIds),
  ]);
  return (
    <CampusMapRuntime
      initialSearch={params.toString()}
      factSchema={factSchema}
      initialBrowseProjection={browseProjection}
      initialAmapHotspotMappings={amapHotspotMappings}
      initialFeedbackSummaries={feedbackSummaries}
      initialPlaceCovers={placeCovers}
    />
  );
}
