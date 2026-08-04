import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StationFoodMap } from "@/components/food-map/station-food-map";
import {
  FOODLE_STATION_MAPS,
  isFoodleStationId,
} from "@/lib/food-map/restaurant-catalog";

interface StationPageProps {
  params: Promise<{ stationId: string }>;
}

export async function generateMetadata({
  params,
}: StationPageProps): Promise<Metadata> {
  const stationId = (await params).stationId.toUpperCase();
  if (!isFoodleStationId(stationId)) return {};

  const station = FOODLE_STATION_MAPS[stationId];
  return {
    title: `${station.nameZh}站附近餐厅 | 通勤食图`,
    description: `查看${station.nameZh}地铁站 500 米内的餐厅、营业时间、价格与打卡热度。`,
  };
}

export default async function FoodMapStationPage({ params }: StationPageProps) {
  const stationId = (await params).stationId.toUpperCase();
  if (!isFoodleStationId(stationId)) notFound();

  return (
    <div className="min-w-0 flex-1">
      <StationFoodMap stationId={stationId} />
    </div>
  );
}
