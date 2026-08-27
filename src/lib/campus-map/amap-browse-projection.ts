import {
  CAMPUS_MAP_DEFAULT_VIEW_CENTER,
  type CampusMapBrowseProjection,
} from "./browse-projection";
import type { CampusMapSelectionTarget } from "./fact-store";

export type CampusMapAmapPosition = readonly [
  longitude: number,
  latitude: number,
];

export interface CampusMapAmapCoordinateConverter {
  convertFrom(
    positions: ReadonlyArray<CampusMapAmapPosition>,
    source: "gps",
    callback: (
      status: "complete" | "error",
      result: {
        locations?: ReadonlyArray<{ lng: number; lat: number }>;
      },
    ) => void,
  ): void;
}

export type CampusMapAmapCoordinateProjection =
  | {
      status: "ready";
      center: CampusMapAmapPosition;
      offset: CampusMapAmapPosition;
      positions: Readonly<Record<string, CampusMapAmapPosition>>;
    }
  | { status: "error" };

export interface CampusMapAmapPoiInput {
  providerObjectId: string | null;
  name: string;
  /** AMap emits GCJ-02 coordinates at this adapter boundary. */
  position: CampusMapAmapPosition;
}

export type CampusMapAmapPoiCard =
  | {
      kind: "linked";
      title: string;
      selectionTarget: CampusMapSelectionTarget;
    }
  | {
      kind: "transient";
      externalId: string;
      title: string;
      sourceLabel: "高德地图地点";
      position: CampusMapAmapPosition;
    };

function isValidPosition(position: CampusMapAmapPosition) {
  return (
    Number.isFinite(position[0]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    Number.isFinite(position[1]) &&
    position[1] >= -90 &&
    position[1] <= 90
  );
}

function roundedCoordinateDelta(value: number) {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

/**
 * Converts only presentation coordinates. Canonical WGS84 assertions remain
 * inside the provider-neutral browse projection and are never mutated.
 */
export function projectCampusMapBrowseToAmap(
  projection: CampusMapBrowseProjection,
  converter: CampusMapAmapCoordinateConverter,
): Promise<CampusMapAmapCoordinateProjection> {
  const entries = [
    ...projection.buildings.flatMap((building) =>
      building.anchor
        ? [
            {
              key: `building:${building.buildingId}`,
              position: [
                building.anchor.longitude,
                building.anchor.latitude,
              ] as const,
            },
          ]
        : [],
    ),
    ...projection.markers.flatMap((marker) =>
      marker.kind === "place"
        ? [
            {
              key: `place:${marker.placeId}`,
              position: [
                marker.position.longitude,
                marker.position.latitude,
              ] as const,
            },
          ]
        : [],
    ),
  ];
  const canonicalPositions: CampusMapAmapPosition[] = [
    [...CAMPUS_MAP_DEFAULT_VIEW_CENTER],
    ...entries.map(
      ({ position }) => [position[0], position[1]] as CampusMapAmapPosition,
    ),
  ];
  const providerInput = canonicalPositions.map(
    ([longitude, latitude]) => [longitude, latitude] as CampusMapAmapPosition,
  );

  return new Promise((resolve) => {
    try {
      converter.convertFrom(providerInput, "gps", (status, result) => {
        const locations = status === "complete" ? result.locations : undefined;
        if (
          !locations ||
          locations.length !== canonicalPositions.length ||
          locations.some(({ lng, lat }) => !isValidPosition([lng, lat]))
        ) {
          resolve({ status: "error" });
          return;
        }
        const center = [locations[0]!.lng, locations[0]!.lat] as const;
        const positions = Object.fromEntries(
          entries.map((entry, index) => {
            const location = locations[index + 1]!;
            return [entry.key, [location.lng, location.lat] as const];
          }),
        );
        resolve({
          status: "ready",
          center,
          offset: [
            roundedCoordinateDelta(
              center[0] - CAMPUS_MAP_DEFAULT_VIEW_CENTER[0],
            ),
            roundedCoordinateDelta(
              center[1] - CAMPUS_MAP_DEFAULT_VIEW_CENTER[1],
            ),
          ],
          positions,
        });
      });
    } catch {
      resolve({ status: "error" });
    }
  });
}

export class CampusMapAmapCoordinateProjector {
  private revision = 0;

  invalidate() {
    this.revision += 1;
  }

  async projectLatest(
    projection: CampusMapBrowseProjection,
    converter: CampusMapAmapCoordinateConverter,
  ): Promise<CampusMapAmapCoordinateProjection | { status: "superseded" }> {
    const revision = ++this.revision;
    const result = await projectCampusMapBrowseToAmap(projection, converter);
    return revision === this.revision ? result : { status: "superseded" };
  }
}

export function createTransientCampusMapAmapPoiCard(
  input: CampusMapAmapPoiInput,
): CampusMapAmapPoiCard | null {
  if (!isValidPosition(input.position)) return null;
  const providerObjectId = input.providerObjectId?.trim() || null;
  return {
    kind: "transient",
    externalId: providerObjectId ?? `${input.position[0]},${input.position[1]}`,
    title: input.name.trim() || "高德地图地点",
    sourceLabel: "高德地图地点",
    position: [input.position[0], input.position[1]],
  };
}

/**
 * Builds the only AMap POI card model. A provider mapping is accepted only
 * when its canonical target is present in the same public Current projection.
 */
export function projectCampusMapAmapPoiCard(
  projection: CampusMapBrowseProjection,
  input: CampusMapAmapPoiInput,
  mapping: CampusMapSelectionTarget | null,
): CampusMapAmapPoiCard | null {
  if (mapping?.kind === "building") {
    const building = projection.buildings.find(
      (candidate) => candidate.buildingId === mapping.buildingId,
    );
    if (building) {
      return {
        kind: "linked",
        title: building.name,
        selectionTarget: building.selectionTarget,
      };
    }
  } else if (mapping?.kind === "place") {
    const place = projection.places.find(
      (candidate) => candidate.placeId === mapping.placeId,
    );
    if (place) {
      return {
        kind: "linked",
        title: place.name,
        selectionTarget: place.selectionTarget,
      };
    }
  }
  return createTransientCampusMapAmapPoiCard(input);
}

export class CampusMapAmapPoiCardResolver {
  private revision = 0;

  constructor(
    private readonly loadCard: (
      input: CampusMapAmapPoiInput,
    ) => Promise<CampusMapAmapPoiCard | null>,
  ) {}

  invalidate() {
    this.revision += 1;
  }

  async resolveLatest(
    input: CampusMapAmapPoiInput,
  ): Promise<
    | { status: "resolved"; card: CampusMapAmapPoiCard | null }
    | { status: "superseded" }
  > {
    const revision = ++this.revision;
    let card: CampusMapAmapPoiCard | null;
    try {
      card = await this.loadCard(input);
    } catch {
      card = createTransientCampusMapAmapPoiCard(input);
    }
    return revision === this.revision
      ? { status: "resolved", card }
      : { status: "superseded" };
  }
}

export function createCampusMapAmapPoiCardContent(
  ownerDocument: Pick<Document, "createElement">,
  card: Extract<CampusMapAmapPoiCard, { kind: "transient" }>,
) {
  const content = ownerDocument.createElement("div");
  content.className = "min-w-36 px-1 py-0.5 text-[#17211c]";
  const title = ownerDocument.createElement("strong");
  title.className = "block text-sm font-semibold";
  title.textContent = card.title;
  const source = ownerDocument.createElement("span");
  source.className = "mt-1 block text-xs text-neutral-500";
  source.textContent = card.sourceLabel;
  content.append(title, source);
  return content;
}
