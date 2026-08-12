export interface ScreenRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CameraPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CameraReason =
  | "map-selection"
  | "search-selection"
  | "deep-link"
  | "facility-selection"
  | "sheet-layout"
  | "building-floor"
  | "building-amenity"
  | "building-query";

export type CameraZoomPolicy =
  | { kind: "preserve" }
  | { kind: "fit"; maxZoom: number };

export interface CameraPolicy {
  padding: CameraPadding;
  zoom: CameraZoomPolicy;
  animate: boolean;
}

function isFiniteRect(rect: ScreenRect) {
  return (
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.left) &&
    rect.right > rect.left &&
    rect.bottom > rect.top
  );
}

function overlap(a: ScreenRect, b: ScreenRect): ScreenRect | null {
  const intersection = {
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
  };
  return isFiniteRect(intersection) ? intersection : null;
}

function nearestHorizontalEdge(map: ScreenRect, occlusion: ScreenRect) {
  const leftGap = occlusion.left - map.left;
  const rightGap = map.right - occlusion.right;
  return leftGap < rightGap ? "left" : "right";
}

function nearestVerticalEdge(map: ScreenRect, occlusion: ScreenRect) {
  const topGap = occlusion.top - map.top;
  const bottomGap = map.bottom - occlusion.bottom;
  return topGap < bottomGap ? "top" : "bottom";
}

/**
 * Converts the actual panel overlap into padding for the map's visible area.
 * A narrow/tall overlap is treated as a side panel; a wide/short overlap is
 * treated as a top or bottom sheet. This avoids a separate responsive
 * breakpoint that can drift away from CSS.
 */
export function deriveCameraPadding(
  mapRect: ScreenRect,
  panelRect: ScreenRect | null,
  gap = 24,
): CameraPadding {
  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 24;
  const padding: CameraPadding = {
    top: safeGap,
    right: safeGap,
    bottom: safeGap,
    left: safeGap,
  };
  if (!isFiniteRect(mapRect) || !panelRect || !isFiniteRect(panelRect)) {
    return padding;
  }

  const occlusion = overlap(mapRect, panelRect);
  if (!occlusion) return padding;

  const width = occlusion.right - occlusion.left;
  const height = occlusion.bottom - occlusion.top;
  if (width > height) {
    const edge = nearestVerticalEdge(mapRect, occlusion);
    padding[edge] = height + safeGap;
  } else {
    const edge = nearestHorizontalEdge(mapRect, occlusion);
    padding[edge] = width + safeGap;
  }
  return padding;
}

export function cameraPolicyFor(
  reason: CameraReason,
  mapRect: ScreenRect,
  panelRect: ScreenRect | null,
): CameraPolicy | null {
  const padding = deriveCameraPadding(mapRect, panelRect);
  switch (reason) {
    case "map-selection":
    case "sheet-layout":
      return { padding, zoom: { kind: "preserve" }, animate: true };
    case "facility-selection":
      return { padding, zoom: { kind: "fit", maxZoom: 18.5 }, animate: true };
    case "search-selection":
      return { padding, zoom: { kind: "fit", maxZoom: 17.2 }, animate: true };
    case "deep-link":
      return { padding, zoom: { kind: "fit", maxZoom: 17.2 }, animate: false };
    case "building-floor":
    case "building-amenity":
    case "building-query":
      return null;
  }
}

/**
 * Guards asynchronous camera work (layout settling, animation callbacks, and
 * ResizeObserver updates) so a stale selection can never move the map after a
 * newer request has started.
 */
export class CameraRequestGate {
  private currentToken = 0;

  begin() {
    const token = ++this.currentToken;
    return {
      token,
      isCurrent: () => token === this.currentToken,
    };
  }

  invalidate() {
    this.currentToken += 1;
  }
}
