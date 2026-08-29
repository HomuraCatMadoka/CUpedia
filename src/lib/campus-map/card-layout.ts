export const CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT = 3;

export type CampusMapMobilePanelLayout =
  | { kind: "placing" }
  | { kind: "edit" }
  | { kind: "expanded" }
  | { kind: "provider-error" }
  | { kind: "provider-poi" }
  | { kind: "empty-building" }
  | { kind: "facility" }
  | { kind: "building" }
  | { kind: "category"; resultCount: number }
  | { kind: "default" };

export function campusMapMobilePanelHeight(
  layout: CampusMapMobilePanelLayout,
): string {
  switch (layout.kind) {
    case "placing":
      return "min(336px, 48dvh)";
    case "edit":
      return "var(--campus-map-edit-sheet-height)";
    case "expanded":
      return "72dvh";
    case "provider-poi":
      return "120px";
    case "empty-building":
      return "136px";
    case "facility":
      return "min(300px, 40dvh)";
    case "building":
      return "min(340px, 42dvh)";
    case "category": {
      if (layout.resultCount > CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT) {
        return "min(352px, 44dvh)";
      }
      const contentHeight = Math.max(208, 124 + layout.resultCount * 56);
      return `min(${contentHeight}px, 44dvh)`;
    }
    case "provider-error":
    case "default":
      return "var(--campus-map-peek-height)";
  }
}
