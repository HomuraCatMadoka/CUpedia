import type { CampusMapPublicPlaceType } from "@/lib/campus-map/place-type-contract";
import type { CampusMapMarkerLabelPlacement } from "@/lib/campus-map/marker-label-layout";

const PLACE_TYPE_PATHS: Record<CampusMapPublicPlaceType, string> = {
  toilet:
    '<path d="M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.6a.5.5 0 0 0-.42.77l1.54 2.47a.5.5 0 0 1-.42.76H5.4a.5.5 0 0 1-.42-.77L7 18"/><path d="M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8"/>',
  water:
    '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  printer:
    '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  "common-space":
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  classroom:
    '<path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M18 4.933V21"/><path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6"/><path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11"/><path d="M6 4.933V21"/><circle cx="12" cy="9" r="2"/>',
  "sports-facility":
    '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
  "health-service":
    '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/><path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
};

function icon(path: string, attribute = "") {
  return `<svg aria-hidden="true" ${attribute} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

export function placeTypeMarkerIcon(placeType: CampusMapPublicPlaceType) {
  return icon(
    PLACE_TYPE_PATHS[placeType],
    `data-place-type-icon="${placeType}"`,
  );
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

function compactMarkerName(value: string) {
  const withoutEnglishTranslation = value
    .replace(/\s*[（(][^（）()]*[a-z][^（）()]*[）)]\s*$/iu, "")
    .trim();
  const characters = [...(withoutEnglishTranslation || value)];
  return characters.length > 24
    ? `${characters.slice(0, 23).join("")}…`
    : characters.join("");
}

function markerButton(input: {
  identityAttribute: string;
  identity: string;
  label: string;
  selected: boolean;
  color: string;
  icon: string;
  count?: number;
  selectedLabel?: string;
  precisionLabel?: string;
  selectedLabelPlacement?: CampusMapMarkerLabelPlacement;
}) {
  const safeColor = /^#[\da-f]{3,8}$/i.test(input.color)
    ? input.color
    : "#176346";
  const count =
    input.count && input.count > 1
      ? `<span aria-hidden="true" style="position:absolute;top:-10px;right:-14px;min-width:24px;padding:2px 5px;border:2px solid white;border-radius:8px;background:${safeColor};font:700 12px system-ui">${input.count}</span>`
      : "";
  const placement = input.selectedLabelPlacement ?? "top";
  const labelPosition =
    placement === "bottom"
      ? "top:calc(100% + 10px);left:50%;transform:translateX(-50%)"
      : placement === "left"
        ? "right:calc(100% + 10px);top:50%;transform:translateY(-50%)"
        : placement === "right"
          ? "left:calc(100% + 10px);top:50%;transform:translateY(-50%)"
          : "bottom:calc(100% + 10px);left:50%;transform:translateX(-50%)";
  const selectedLabel = input.selected
    ? `<span data-campus-map-selected-label data-campus-map-label-placement="${placement}" style="position:absolute;${labelPosition};width:max-content;max-width:180px;box-sizing:border-box;border:2px solid ${safeColor};border-radius:12px;padding:6px 10px;background:white;color:#17211c;font:600 13px/18px system-ui;box-shadow:0 3px 12px rgba(0,0,0,.2);overflow-wrap:anywhere;white-space:normal"><span style="display:block;max-height:36px;overflow:hidden">已选 · ${escapeAttribute(compactMarkerName(input.selectedLabel ?? input.label))}</span><span style="display:block;font-size:11px;font-weight:400">${escapeAttribute(input.precisionLabel ?? "")}</span></span>`
    : "";
  return `<button type="button" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black" data-cupedia-marker="true" ${input.identityAttribute}="${escapeAttribute(input.identity)}" aria-label="${escapeAttribute(input.label)}" aria-pressed="${input.selected}" style="position:relative;display:grid;width:44px;height:44px;place-items:center;border:${input.selected ? 4 : 3}px solid white;border-radius:${input.selected ? "12px" : "999px"};background:${safeColor};color:white;box-shadow:${input.selected ? "0 0 0 4px rgba(23,75,56,.28),0 5px 16px rgba(0,0,0,.3)" : "0 3px 12px rgba(0,0,0,.22)"}">${input.icon}${count}${selectedLabel}</button>`;
}

export function placeTypeMarkerContent(input: {
  markerKey: string;
  name: string;
  buildingName: string;
  floorLabel: string;
  placeType: CampusMapPublicPlaceType;
  color: string;
  selected: boolean;
  markerLabel?: string;
  count?: number;
  precisionLabel?: string;
  selectedLabelPlacement?: CampusMapMarkerLabelPlacement;
}) {
  return markerButton({
    identityAttribute: "data-canonical-marker-key",
    identity: input.markerKey,
    label:
      input.markerLabel ??
      `${input.buildingName}内有${input.name}，${input.floorLabel}，建筑级位置`,
    selected: input.selected,
    color: input.color,
    icon: placeTypeMarkerIcon(input.placeType),
    count: input.selected ? undefined : input.count,
    selectedLabel: input.name,
    precisionLabel: input.precisionLabel,
    selectedLabelPlacement: input.selectedLabelPlacement,
  });
}

export function placeClusterMarkerContent(input: {
  label: string;
  count: number | null;
  measure: "地点" | "位置";
  color: string;
  placeType: CampusMapPublicPlaceType | null;
}) {
  const safeColor = /^#[\da-f]{3,8}$/i.test(input.color)
    ? input.color
    : "#374151";
  const iconContent = input.placeType
    ? placeTypeMarkerIcon(input.placeType)
    : icon(
        '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      );
  return `<button type="button" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black" data-cupedia-marker="true" data-campus-map-cluster aria-label="${escapeAttribute(input.label)}" style="display:flex;min-width:64px;min-height:48px;align-items:center;justify-content:center;gap:6px;padding:5px 10px;border:3px solid white;border-radius:14px;background:${safeColor};color:white;box-shadow:0 3px 12px rgba(0,0,0,.22)">${iconContent}<span style="font:700 14px/16px system-ui">${input.count ?? "聚合"}<span style="display:block;font-size:10px;font-weight:400">${input.measure}</span></span></button>`;
}
