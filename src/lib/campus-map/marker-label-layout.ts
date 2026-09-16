import type { ScreenRect } from "@/lib/campus-map/camera-policy";

export type CampusMapMarkerLabelPlacement = "top" | "right" | "bottom" | "left";

interface MarkerLabelLayoutInput {
  marker: { x: number; y: number };
  map: ScreenRect;
  obstacles: readonly ScreenRect[];
  label?: { width: number; height: number };
  markerSize?: number;
  gap?: number;
}

const PLACEMENT_ORDER: readonly CampusMapMarkerLabelPlacement[] = [
  "top",
  "bottom",
  "left",
  "right",
];

function area(rect: ScreenRect) {
  return (
    Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top)
  );
}

function intersectionArea(a: ScreenRect, b: ScreenRect) {
  return area({
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
  });
}

function labelRect(
  placement: CampusMapMarkerLabelPlacement,
  marker: MarkerLabelLayoutInput["marker"],
  label: { width: number; height: number },
  markerSize: number,
  gap: number,
): ScreenRect {
  const radius = markerSize / 2;
  if (placement === "top" || placement === "bottom") {
    const top =
      placement === "top"
        ? marker.y - radius - gap - label.height
        : marker.y + radius + gap;
    return {
      top,
      right: marker.x + label.width / 2,
      bottom: top + label.height,
      left: marker.x - label.width / 2,
    };
  }
  const left =
    placement === "left"
      ? marker.x - radius - gap - label.width
      : marker.x + radius + gap;
  return {
    top: marker.y - label.height / 2,
    right: left + label.width,
    bottom: marker.y + label.height / 2,
    left,
  };
}

function overflowArea(candidate: ScreenRect, map: ScreenRect) {
  return Math.max(0, area(candidate) - intersectionArea(candidate, map));
}

/**
 * Chooses a stable side for the complete selected-marker label. Obstacles are
 * presentation geometry only: they never influence Place/Building identity.
 */
export function chooseCampusMapMarkerLabelPlacement({
  marker,
  map,
  obstacles,
  label = { width: 180, height: 66 },
  markerSize = 44,
  gap = 10,
}: MarkerLabelLayoutInput): CampusMapMarkerLabelPlacement {
  const candidates = PLACEMENT_ORDER.map((placement) => {
    const candidate = labelRect(placement, marker, label, markerSize, gap);
    const overlap = obstacles.reduce(
      (total, obstacle) => total + intersectionArea(candidate, obstacle),
      0,
    );
    const overflow = overflowArea(candidate, map);
    return { placement, overlap, overflow };
  });
  return (
    candidates.find(
      (candidate) => candidate.overlap === 0 && candidate.overflow === 0,
    ) ??
    candidates.reduce((best, candidate) => {
      // Leaving the map makes the label unreachable, so weight overflow above
      // overlap with chrome when every side is constrained.
      const score = candidate.overflow * 2 + candidate.overlap;
      const bestScore = best.overflow * 2 + best.overlap;
      return score < bestScore ? candidate : best;
    })
  ).placement;
}
