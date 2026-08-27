export type CampusMapAmenity =
  | "toilet"
  | "water"
  | "printer"
  | "common-space"
  | "classroom";

const PATHS: Record<CampusMapAmenity, string> = {
  toilet:
    '<path d="M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.6a.5.5 0 0 0-.42.77l1.54 2.47a.5.5 0 0 1-.42.76H5.4a.5.5 0 0 1-.42-.77L7 18"/><path d="M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8"/>',
  water:
    '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  printer:
    '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  "common-space":
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  classroom:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
};

export function facilityMarkerIcon(category: CampusMapAmenity) {
  return `<svg aria-hidden="true" data-amenity-icon="${category}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[category]}</svg>`;
}

function escapeAttribute(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

export function facilityMarkerContent(input: {
  id: string;
  name: string;
  buildingName: string;
  floorLabel: string;
  category: CampusMapAmenity;
  color: string;
  selected: boolean;
  markerLabel?: string;
}) {
  const {
    id,
    name,
    buildingName,
    floorLabel,
    category,
    color,
    selected,
    markerLabel,
  } = input;
  const safeId = escapeAttribute(id);
  const safeLabel = escapeAttribute(
    markerLabel ?? `${buildingName}内有${name}，${floorLabel}，建筑级位置`,
  );
  const safeColor = /^#[\da-f]{3,8}$/i.test(color) ? color : "#176346";
  return `<button type="button" data-cupedia-marker="true" data-facility-id="${safeId}" aria-label="${safeLabel}" aria-pressed="${selected}" style="display:grid;width:44px;height:44px;place-items:center;border:${selected ? 4 : 3}px solid white;border-radius:999px;background:${safeColor};color:white;box-shadow:${selected ? "0 0 0 4px rgba(23,75,56,.28),0 5px 16px rgba(0,0,0,.3)" : "0 3px 12px rgba(0,0,0,.22)"};transform:${selected ? "scale(1.08)" : "none"}">${facilityMarkerIcon(category)}</button>`;
}
