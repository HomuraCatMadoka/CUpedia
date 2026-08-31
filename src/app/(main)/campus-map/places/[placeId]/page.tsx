import { notFound } from "next/navigation";

import { CampusMapPlaceDetail } from "@/components/campus-map/place-detail";
import { getAuthenticatedUserForApi } from "@/lib/auth-guard";
import {
  getCampusMapPlaceHistory,
  getCampusMapPlaceRevision,
  listCampusMapBrowseBuildings,
} from "@/lib/campus-map/fact-store";
import { encodeCampusMapPlaceHref } from "@/lib/campus-map/scene-codec";

export const dynamic = "force-dynamic";

export default async function CampusMapPlacePage({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const { placeId } = await params;
  const history = await getCampusMapPlaceHistory(placeId, { limit: 1 });
  const head = history.head;
  if (!head) notFound();
  const [current, buildings, viewer] = await Promise.all([
    getCampusMapPlaceRevision(placeId, head.revisionId),
    listCampusMapBrowseBuildings(),
    getAuthenticatedUserForApi(),
  ]);
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
    />
  );
}
