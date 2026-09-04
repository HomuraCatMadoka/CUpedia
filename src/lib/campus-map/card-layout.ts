export const CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT = 3;

export type CampusMapMobilePanelLayout =
  | { kind: "location-selection" }
  | { kind: "placing" }
  | { kind: "edit" }
  | {
      kind: "expanded";
      content: "building";
      resultCount: number;
      groupCount: number;
    }
  | { kind: "expanded"; content: "category"; resultCount: number }
  | { kind: "transient-hotspot" }
  | { kind: "empty-building" }
  | { kind: "place" }
  | { kind: "building" }
  | { kind: "category"; resultCount: number }
  | { kind: "default" };

export function campusMapMobilePanelHeight(
  layout: CampusMapMobilePanelLayout,
): string {
  switch (layout.kind) {
    case "location-selection":
      return "min(168px, 42dvh)";
    case "placing":
      return "min(336px, 48dvh)";
    case "edit":
      return "100dvh";
    case "expanded": {
      const contentHeight =
        layout.content === "building"
          ? 300 + layout.resultCount * 64 + layout.groupCount * 16
          : 140 + layout.resultCount * 56;
      return `min(${contentHeight}px, 62dvh)`;
    }
    case "transient-hotspot":
      return "120px";
    case "empty-building":
      return "208px";
    case "place":
      return "min(264px, 35dvh)";
    case "building":
      return "min(352px, 44dvh)";
    case "category": {
      if (layout.resultCount > CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT) {
        return "min(352px, 44dvh)";
      }
      const contentHeight = Math.max(208, 124 + layout.resultCount * 56);
      return `min(${contentHeight}px, 44dvh)`;
    }
    case "default":
      return "var(--campus-map-peek-height)";
  }
}
