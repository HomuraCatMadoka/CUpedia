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

export interface CameraPoint {
  x: number;
  y: number;
}

export const MOBILE_PLACEMENT_ANCHOR_RATIO = 0.26;
const DESKTOP_PLACEMENT_MIN_WIDTH = 768;

export function placementAnchorPoint(viewport: {
  width: number;
  height: number;
}): CameraPoint {
  return {
    x: viewport.width / 2,
    y:
      viewport.width < DESKTOP_PLACEMENT_MIN_WIDTH
        ? viewport.height * MOBILE_PLACEMENT_ANCHOR_RATIO
        : viewport.height / 2,
  };
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
  const mapWidth = mapRect.right - mapRect.left;
  const mapHeight = mapRect.bottom - mapRect.top;
  const horizontalCoverage = width / mapWidth;
  const verticalCoverage = height / mapHeight;
  if (horizontalCoverage >= verticalCoverage) {
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
    case "facility-selection":
    case "sheet-layout":
      return { padding, zoom: { kind: "preserve" }, animate: true };
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
 * Returns the nearest visible point for an anchor, or null when the anchor is
 * already inside the padded viewport. This keeps preserve-zoom interactions
 * stationary unless a panel or viewport edge actually obscures the target.
 */
export function nearestVisibleCameraPoint(
  point: CameraPoint,
  viewport: { width: number; height: number },
  padding: CameraPadding,
): CameraPoint | null {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return null;
  }

  const left = padding.left;
  const right = viewport.width - padding.right;
  const top = padding.top;
  const bottom = viewport.height - padding.bottom;
  if (left > right || top > bottom) return null;

  const target = {
    x: Math.min(Math.max(point.x, left), right),
    y: Math.min(Math.max(point.y, top), bottom),
  };
  return target.x === point.x && target.y === point.y ? null : target;
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
