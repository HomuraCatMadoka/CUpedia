export type CampusMapBrowseSheetSnap = "peek" | "half" | "full";

export function campusMapBrowsePanelHeight(snap: CampusMapBrowseSheetSnap) {
  const limit =
    snap === "full"
      ? "calc(var(--campus-map-browse-viewport-height, 100dvh) - 80px)"
      : snap === "half"
        ? "calc(var(--campus-map-browse-viewport-height, 100dvh) * 0.55)"
        : "min(380px, calc(var(--campus-map-browse-viewport-height, 100dvh) * 0.45))";
  return `min(var(--campus-map-browse-content-height, 380px), max(var(--campus-map-browse-core-height, 0px), ${limit}))`;
}

export function campusMapNearestBrowseSheetSnap(
  height: number,
  contentHeight: number,
  coreHeight: number,
  viewportHeight: number,
): CampusMapBrowseSheetSnap {
  const heights = {
    peek: Math.min(
      contentHeight,
      Math.max(coreHeight, Math.min(380, viewportHeight * 0.45)),
    ),
    half: Math.min(contentHeight, Math.max(coreHeight, viewportHeight * 0.55)),
    full: Math.min(contentHeight, Math.max(coreHeight, viewportHeight - 80)),
  };
  return (Object.keys(heights) as CampusMapBrowseSheetSnap[]).reduce(
    (closest, snap) =>
      Math.abs(heights[snap] - height) < Math.abs(heights[closest] - height)
        ? snap
        : closest,
    "peek",
  );
}

export type CampusMapMobilePanelLayout =
  | { kind: "location-selection" }
  | { kind: "placing" }
  | { kind: "edit" }
  | { kind: "add" }
  | { kind: "feedback" }
  | { kind: "transient-hotspot"; candidateCount?: number }
  | { kind: "empty-building"; hasFloors?: boolean }
  | {
      kind: "place";
      hasSummary?: boolean;
      hasOfficialActions?: boolean;
    }
  | { kind: "building" }
  | { kind: "category"; resultCount: number }
  | { kind: "default" };

export function campusMapMobilePanelHeight(
  layout: CampusMapMobilePanelLayout,
): string {
  switch (layout.kind) {
    case "location-selection":
      return "min(420px, calc(100dvh - 100px))";
    case "placing":
      return "min(336px, 48dvh)";
    case "feedback":
      return "min(480px, 68dvh)";
    case "add":
      return "min(640px, 82dvh)";
    case "edit":
      return "100dvh";
    case "transient-hotspot":
      return `min(${184 + Math.max(0, (layout.candidateCount ?? 0) - 1) * 52}px, calc(100dvh - 80px))`;
    case "empty-building":
      return layout.hasFloors ? "min(288px, calc(100dvh - 80px))" : "208px";
    case "place": {
      const contentHeight =
        184 +
        (layout.hasSummary ? 68 : 0) +
        (layout.hasOfficialActions ? 56 : 0);
      return `min(${contentHeight}px, 35dvh)`;
    }
    case "building":
      return "min(352px, 53dvh)";
    case "category": {
      const contentHeight = Math.max(
        208,
        Math.min(352, 124 + layout.resultCount * 56),
      );
      return `min(${contentHeight}px, 44dvh)`;
    }
    case "default":
      return "var(--campus-map-peek-height)";
  }
}
