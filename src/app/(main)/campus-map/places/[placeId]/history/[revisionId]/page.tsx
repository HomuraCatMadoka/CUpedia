import { notFound } from "next/navigation";

import { CampusMapRevisionPage } from "@/components/campus-map/history-shell";
import { getCampusMapPlaceRevision } from "@/lib/campus-map/fact-store";
import { safeCampusMapListReturnPath } from "@/lib/campus-map/scene-codec";

export const dynamic = "force-dynamic";

export default async function CampusMapPlaceRevisionRoute({
  params,
  searchParams,
}: {
  params: Promise<{ placeId: string; revisionId: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  const { placeId, revisionId } = await params;
  const mapListReturnPath = safeCampusMapListReturnPath(
    (await searchParams)?.from,
  );
  const revision = await getCampusMapPlaceRevision(placeId, revisionId);
  if (!revision) notFound();
  return (
    <CampusMapRevisionPage
      revision={revision}
      mapListReturnPath={mapListReturnPath}
    />
  );
}
