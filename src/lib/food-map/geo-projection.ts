/**
 * 通勤食图投影：WGS84 经纬度 → 画布坐标。
 * 等距投影带纬度修正，香港尺度（<50km）误差可忽略。
 * 参数必须与 scripts/build-food-map-geo.mjs 一致。
 */

const LNG0 = 114.05;
const LAT_TOP = 22.56;
const K = 1991;
const COS = Math.cos((22.4 * Math.PI) / 180);

export interface LngLat {
  lng: number;
  lat: number;
}

export function projectLngLat({ lng, lat }: LngLat): { x: number; y: number } {
  return {
    x: (lng - LNG0) * COS * K,
    y: (LAT_TOP - lat) * K,
  };
}
