import { notFound } from "next/navigation";

import { CampusMapPlaceDetail } from "@/components/campus-map/place-detail";
import { getAuthenticatedUserForApi } from "@/lib/auth-guard";
import {
  getCampusMapPlaceHistory,
  getCampusMapPlaceRevision,
  listCampusMapBrowseBuildings,
} from "@/lib/campus-map/fact-store";
import {
  getCampusMapPlaceFeedbackPage,
  getCampusMapViewerPlaceFeedback,
} from "@/lib/campus-map/place-feedback";
import { encodeCampusMapPlaceHref } from "@/lib/campus-map/scene-codec";

export const dynamic = "force-dynamic";

export default async function CampusMapPlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ placeId: string }>;
  searchParams?: Promise<{ reviewsAfter?: string | string[] }>;
}) {
  const { placeId } = await params;
  const rawReviewsAfter = (await searchParams)?.reviewsAfter;
  const reviewsAfter =
    typeof rawReviewsAfter === "string" ? rawReviewsAfter : undefined;
  const history = await getCampusMapPlaceHistory(placeId, { limit: 1 });
  const head = history.head;
  if (!head) notFound();
  const [current, buildings, viewer, feedback] = await Promise.all([
    getCampusMapPlaceRevision(placeId, head.revisionId),
    listCampusMapBrowseBuildings(),
    getAuthenticatedUserForApi(),
    getCampusMapPlaceFeedbackPage(placeId, {
      cursor: reviewsAfter,
      limit: 10,
    }),
  ]);
  const viewerFeedback = viewer
    ? await getCampusMapViewerPlaceFeedback(placeId, viewer.id)
    : null;
  const fact =
    current?.content.visibility === "public" ? current.content.fact : null;
  const buildingRecord = fact?.buildingId
    ? buildings.find((item) => item.buildingId === fact.buildingId)
    : null;
  const floorRecord =
    fact?.floorId && buildingRecord
      ? buildingRecord.floors.find((item) => item.floorId === fact.floorId)
      : null;

  return (
    <CampusMapPlaceDetail
      placeId={placeId}
      head={head}
      fact={fact}
      retirementReason={
        head.status === "retired" && current?.operation === "retire"
          ? current.comment
          : null
      }
      mapHref={encodeCampusMapPlaceHref(placeId, head)}
      building={
        buildingRecord
          ? {
              name: buildingRecord.name,
              floorLabel: floorRecord?.displayLabel ?? null,
            }
          : null
      }
      isAdmin={viewer?.role === "admin"}
      feedback={feedback}
      viewerFeedback={viewerFeedback}
      viewerCanWrite={Boolean(viewer)}
      feedbackPageIsPaginated={Boolean(reviewsAfter)}
    />
  );
}
