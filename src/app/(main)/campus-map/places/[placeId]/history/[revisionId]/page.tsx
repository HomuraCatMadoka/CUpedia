import { notFound } from "next/navigation";

import { CampusMapRevisionPage } from "@/components/campus-map/history-shell";
import { getCampusMapPlaceRevision } from "@/lib/campus-map/fact-store";

export const dynamic = "force-dynamic";

export default async function CampusMapPlaceRevisionRoute({
  params,
}: {
  params: Promise<{ placeId: string; revisionId: string }>;
}) {
  const { placeId, revisionId } = await params;
  const revision = await getCampusMapPlaceRevision(placeId, revisionId);
  if (!revision) notFound();
  return <CampusMapRevisionPage revision={revision} />;
}
