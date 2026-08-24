import { CampusMapHistoryPage } from "@/components/campus-map/history-shell";
import { getCampusMapPlaceHistory } from "@/lib/campus-map/fact-store";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CampusMapPlaceHistoryRoute({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const { placeId } = await params;
  const history = await getCampusMapPlaceHistory(placeId);
  if (!history.placeExists) notFound();
  return <CampusMapHistoryPage placeId={placeId} items={history.items} />;
}
