import {
  CampusMapHistoryPage,
  CampusMapReadAlert,
} from "@/components/campus-map/history-shell";
import {
  CampusMapReadInputError,
  getCampusMapPlaceHistory,
} from "@/lib/campus-map/fact-store";
import { encodeCampusMapFacilityHref } from "@/lib/campus-map/scene-codec";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CampusMapPlaceHistoryRoute({
  params,
  searchParams,
}: {
  params: Promise<{ placeId: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const { placeId } = await params;
  const search = await searchParams;
  const cursor = Array.isArray(search.cursor)
    ? search.cursor[0]
    : search.cursor;
  let history: Awaited<ReturnType<typeof getCampusMapPlaceHistory>>;
  try {
    history = await getCampusMapPlaceHistory(placeId, { cursor, limit: 25 });
  } catch (error) {
    if (!(error instanceof CampusMapReadInputError)) throw error;
    return (
      <CampusMapReadAlert>
        无法读取修订历史。请检查分页链接后重试。
      </CampusMapReadAlert>
    );
  }
  if (!history.placeExists) notFound();
  return (
    <CampusMapHistoryPage
      placeId={placeId}
      mapHref={encodeCampusMapFacilityHref(placeId, history.head)}
      head={history.head}
      items={history.items}
      nextHref={
        history.nextCursor
          ? `/campus-map/places/${placeId}/history?cursor=${encodeURIComponent(history.nextCursor)}`
          : null
      }
    />
  );
}
