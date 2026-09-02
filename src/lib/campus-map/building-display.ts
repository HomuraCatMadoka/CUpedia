import type { CampusMapBrowseBuilding } from "@/lib/campus-map/browse-projection";

type BuildingDisplaySource = Pick<
  CampusMapBrowseBuilding,
  "buildingId" | "name" | "code"
> &
  Partial<Pick<CampusMapBrowseBuilding, "englishName" | "anchor">>;

export interface CampusMapBuildingDisplayProjection {
  entries: readonly CampusMapBuildingDisplayEntry[];
}

export interface CampusMapBuildingDisplayEntry {
  buildingId: string;
  label: string;
  qualifier: string | null;
}

function normalizedDisplayValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function uniqueTextValue(
  building: BuildingDisplaySource,
  group: readonly BuildingDisplaySource[],
  readValue: (candidate: BuildingDisplaySource) => string | null | undefined,
): string | null {
  const value = readValue(building)?.trim();
  if (!value) return null;
  const normalizedValue = normalizedDisplayValue(value);
  const matches = group.filter((candidate) => {
    const candidateValue = readValue(candidate)?.trim();
    return (
      candidateValue !== undefined &&
      candidateValue !== null &&
      normalizedDisplayValue(candidateValue) === normalizedValue
    );
  });
  return matches.length === 1 ? value : null;
}

function anchorQualifier(
  building: BuildingDisplaySource,
  group: readonly BuildingDisplaySource[],
): string | null {
  const labelFor = (candidate: BuildingDisplaySource) => {
    const anchor = candidate.anchor;
    if (
      !anchor ||
      !Number.isFinite(anchor.longitude) ||
      !Number.isFinite(anchor.latitude)
    ) {
      return null;
    }
    return `${anchor.longitude.toFixed(5)}, ${anchor.latitude.toFixed(5)}`;
  };
  const coordinates = uniqueTextValue(building, group, labelFor);
  return coordinates ? `位置 ${coordinates}` : null;
}

function recordQualifier(
  building: BuildingDisplaySource,
  group: readonly BuildingDisplaySource[],
): string {
  const id = building.buildingId;
  for (let length = Math.min(8, id.length); length <= id.length; length += 1) {
    const prefix = id.slice(0, length);
    const isUnique = group.every(
      (candidate) =>
        candidate.buildingId === id ||
        candidate.buildingId.slice(0, length) !== prefix,
    );
    if (isUnique) return `记录 ${prefix}`;
  }
  return `记录 ${id}`;
}

/**
 * Keeps identifiers available for lookup while exposing only the smallest
 * useful qualifier when two visible building names would be indistinguishable.
 */
export function projectCampusMapBuildingDisplay(
  buildings: readonly BuildingDisplaySource[],
): CampusMapBuildingDisplayProjection {
  const entries = buildings.map((building): CampusMapBuildingDisplayEntry => {
    const normalizedName = normalizedDisplayValue(building.name);
    const group = buildings.filter(
      (candidate) => normalizedDisplayValue(candidate.name) === normalizedName,
    );
    if (group.length === 1) {
      return {
        buildingId: building.buildingId,
        label: building.name,
        qualifier: null,
      };
    }
    const qualifier =
      uniqueTextValue(building, group, (candidate) => candidate.code) ??
      uniqueTextValue(building, group, (candidate) => candidate.englishName) ??
      anchorQualifier(building, group) ??
      recordQualifier(building, group);
    return {
      buildingId: building.buildingId,
      label: `${building.name}（${qualifier}）`,
      qualifier,
    };
  });

  return { entries };
}

export function campusMapBuildingDisplayFor(
  projection: CampusMapBuildingDisplayProjection,
  buildingId: string,
): CampusMapBuildingDisplayEntry | undefined {
  return projection.entries.find((entry) => entry.buildingId === buildingId);
}
