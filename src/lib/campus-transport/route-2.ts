export {
  formatHongKongTime,
  getCampusBusStopBoard as getRoute2StopBoard,
  HONG_KONG_TIME_ZONE,
  hongKongWallTimeToEpoch,
} from "@/lib/campus-transport/campus-bus";

export type {
  CampusBusArrival as Route2Arrival,
  CampusBusPattern as Route2Pattern,
  CampusBusRoute as Route2ViewData,
  CampusBusStop as Route2Stop,
  CampusBusStopBoard as Route2StopBoard,
} from "@/lib/campus-transport/campus-bus";
