export type CampusMapSelection =
  | { kind: "none" }
  | { kind: "building"; buildingId: string }
  | { kind: "facility"; buildingId: string; facilityId: string }
  | {
      kind: "content";
      buildingId: string;
      contentKind: string;
      contentId: string;
    }
  | {
      kind: "external";
      externalId: string;
      position: readonly [longitude: number, latitude: number];
    };

export type CampusMapSheetSnap = "hidden" | "peek" | "full";

export interface CampusMapState {
  mapFilter: {
    category: string | null;
    query: string;
  };
  selection: CampusMapSelection;
  buildingContext: {
    floorId: string | null;
    amenity: string | null;
    query: string;
  };
  sheet: {
    snap: CampusMapSheetSnap;
  };
}

export interface CampusMapCatalog {
  buildings: Readonly<
    Record<string, { floorIds?: readonly string[] } | undefined>
  >;
  facilities: Readonly<
    Record<
      string,
      | {
          buildingId: string;
          floorId?: string | null;
          category?: string | null;
        }
      | undefined
    >
  >;
  contents?: Readonly<
    Record<
      string,
      { buildingId: string; kind: string; floorId?: string | null } | undefined
    >
  >;
}

export type CampusMapHistoryMode = "push" | "replace" | "none";

export type CampusMapAction =
  | { type: "select-building"; buildingId: string }
  | { type: "select-facility"; facilityId: string }
  | { type: "select-content"; contentId: string }
  | {
      type: "select-external";
      externalId: string;
      position: readonly [number, number];
    }
  | { type: "close-selection" }
  | { type: "set-map-category"; category: string | null }
  | { type: "set-map-query"; query: string }
  | { type: "set-building-floor"; floorId: string | null }
  | { type: "set-building-amenity"; amenity: string | null }
  | { type: "set-building-query"; query: string }
  | { type: "set-sheet-snap"; snap: CampusMapSheetSnap }
  | { type: "hydrate"; state: CampusMapState };

const EMPTY_BUILDING_CONTEXT: CampusMapState["buildingContext"] = {
  floorId: null,
  amenity: null,
  query: "",
};

export const EMPTY_CAMPUS_MAP_STATE: CampusMapState = {
  mapFilter: { category: null, query: "" },
  selection: { kind: "none" },
  buildingContext: EMPTY_BUILDING_CONTEXT,
  sheet: { snap: "hidden" },
};

function clean(value: string | null | undefined) {
  const result = value?.trim();
  return result ? result : null;
}

function validPosition(
  value: readonly [number, number],
): value is readonly [number, number] {
  const [longitude, latitude] = value;
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

function floorExists(
  catalog: CampusMapCatalog,
  buildingId: string,
  floorId: string | null,
) {
  if (!floorId) return true;
  return catalog.buildings[buildingId]?.floorIds?.includes(floorId) ?? false;
}

function selectionBuildingId(selection: CampusMapSelection) {
  return selection.kind === "building" ||
    selection.kind === "facility" ||
    selection.kind === "content"
    ? selection.buildingId
    : null;
}

export function canonicalizeCampusMapState(
  state: CampusMapState,
  catalog: CampusMapCatalog,
): CampusMapState {
  let selection: CampusMapSelection = { kind: "none" };

  if (
    state.selection.kind === "building" &&
    catalog.buildings[state.selection.buildingId]
  ) {
    selection = state.selection;
  } else if (state.selection.kind === "facility") {
    const facility = catalog.facilities[state.selection.facilityId];
    if (facility && catalog.buildings[facility.buildingId]) {
      selection = {
        kind: "facility",
        buildingId: facility.buildingId,
        facilityId: state.selection.facilityId,
      };
    }
  } else if (state.selection.kind === "content") {
    const content = catalog.contents?.[state.selection.contentId];
    if (content && catalog.buildings[content.buildingId]) {
      selection = {
        kind: "content",
        buildingId: content.buildingId,
        contentKind: content.kind,
        contentId: state.selection.contentId,
      };
    }
  } else if (
    state.selection.kind === "external" &&
    clean(state.selection.externalId) &&
    validPosition(state.selection.position)
  ) {
    selection = state.selection;
  }

  const buildingId = selectionBuildingId(selection);
  let floorId = clean(state.buildingContext.floorId);
  if (!buildingId || !floorExists(catalog, buildingId, floorId)) floorId = null;

  if (selection.kind === "facility") {
    const facilityFloor = clean(
      catalog.facilities[selection.facilityId]?.floorId,
    );
    if (floorExists(catalog, selection.buildingId, facilityFloor)) {
      floorId = facilityFloor;
    }
  } else if (selection.kind === "content") {
    const contentFloor = clean(
      catalog.contents?.[selection.contentId]?.floorId,
    );
    if (floorExists(catalog, selection.buildingId, contentFloor)) {
      floorId = contentFloor;
    }
  }

  return {
    mapFilter: {
      category: clean(state.mapFilter.category),
      query: state.mapFilter.query.trim(),
    },
    selection,
    buildingContext: buildingId
      ? {
          floorId,
          amenity: clean(state.buildingContext.amenity),
          query: state.buildingContext.query.trim(),
        }
      : EMPTY_BUILDING_CONTEXT,
    sheet: {
      snap:
        selection.kind === "none"
          ? "hidden"
          : state.sheet.snap === "hidden"
            ? "peek"
            : state.sheet.snap,
    },
  };
}

function parsedSnap(value: string | null): CampusMapSheetSnap {
  return value === "full" || value === "peek" || value === "hidden"
    ? value
    : "peek";
}

function finiteNumber(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function parseCampusMapState(
  input: URLSearchParams | string,
  catalog: CampusMapCatalog,
): CampusMapState {
  const params =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;
  const buildingId = clean(params.get("building"));
  const facilityId = clean(params.get("facility"));
  const contentId = clean(params.get("content"));
  const externalId = clean(params.get("external"));
  const longitude = finiteNumber(params.get("lng"));
  const latitude = finiteNumber(params.get("lat"));

  let selection: CampusMapSelection = buildingId
    ? { kind: "building", buildingId }
    : { kind: "none" };
  if (facilityId) {
    selection = {
      kind: "facility",
      buildingId: buildingId ?? "",
      facilityId,
    };
  } else if (contentId) {
    selection = {
      kind: "content",
      buildingId: buildingId ?? "",
      contentKind: clean(params.get("contentKind")) ?? "unknown",
      contentId,
    };
  } else if (externalId && longitude !== null && latitude !== null) {
    selection = {
      kind: "external",
      externalId,
      position: [longitude, latitude],
    };
  }

  return canonicalizeCampusMapState(
    {
      mapFilter: {
        category: clean(params.get("category")),
        query: params.get("query") ?? "",
      },
      selection,
      buildingContext: {
        floorId: clean(params.get("floor")),
        amenity: clean(params.get("amenity")),
        query: params.get("insideQuery") ?? "",
      },
      sheet: { snap: parsedSnap(params.get("panel")) },
    },
    catalog,
  );
}

export function serializeCampusMapState(state: CampusMapState) {
  const params = new URLSearchParams();
  if (state.mapFilter.category)
    params.set("category", state.mapFilter.category);
  if (state.mapFilter.query) params.set("query", state.mapFilter.query);

  if (state.selection.kind === "building") {
    params.set("building", state.selection.buildingId);
  } else if (state.selection.kind === "facility") {
    params.set("building", state.selection.buildingId);
    params.set("facility", state.selection.facilityId);
  } else if (state.selection.kind === "content") {
    params.set("building", state.selection.buildingId);
    params.set("contentKind", state.selection.contentKind);
    params.set("content", state.selection.contentId);
  } else if (state.selection.kind === "external") {
    params.set("external", state.selection.externalId);
    params.set("lng", String(state.selection.position[0]));
    params.set("lat", String(state.selection.position[1]));
  }

  if (selectionBuildingId(state.selection)) {
    if (state.buildingContext.floorId)
      params.set("floor", state.buildingContext.floorId);
    if (state.buildingContext.amenity)
      params.set("amenity", state.buildingContext.amenity);
    if (state.buildingContext.query)
      params.set("insideQuery", state.buildingContext.query);
  }
  if (state.selection.kind !== "none") params.set("panel", state.sheet.snap);
  return params;
}

export function reduceCampusMapState(
  state: CampusMapState,
  action: CampusMapAction,
  catalog: CampusMapCatalog,
): { state: CampusMapState; history: CampusMapHistoryMode } {
  if (action.type === "hydrate") {
    return {
      state: canonicalizeCampusMapState(action.state, catalog),
      history: "none",
    };
  }

  let next: CampusMapState = state;
  let history: CampusMapHistoryMode = "replace";

  switch (action.type) {
    case "select-building":
      next = {
        ...state,
        selection: { kind: "building", buildingId: action.buildingId },
        buildingContext:
          selectionBuildingId(state.selection) === action.buildingId
            ? state.buildingContext
            : EMPTY_BUILDING_CONTEXT,
        sheet: { snap: "peek" },
      };
      history = "push";
      break;
    case "select-facility": {
      const facility = catalog.facilities[action.facilityId];
      next = {
        ...state,
        selection: {
          kind: "facility",
          buildingId: facility?.buildingId ?? "",
          facilityId: action.facilityId,
        },
        buildingContext: {
          floorId: facility?.floorId ?? state.buildingContext.floorId,
          amenity: facility?.category ?? state.buildingContext.amenity,
          query: state.buildingContext.query,
        },
        sheet: { snap: "full" },
      };
      history = "push";
      break;
    }
    case "select-content": {
      const content = catalog.contents?.[action.contentId];
      next = {
        ...state,
        selection: {
          kind: "content",
          buildingId: content?.buildingId ?? "",
          contentKind: content?.kind ?? "unknown",
          contentId: action.contentId,
        },
        buildingContext: {
          ...state.buildingContext,
          floorId: content?.floorId ?? state.buildingContext.floorId,
        },
        sheet: { snap: "full" },
      };
      history = "push";
      break;
    }
    case "select-external":
      next = {
        ...state,
        selection: {
          kind: "external",
          externalId: action.externalId,
          position: action.position,
        },
        buildingContext: EMPTY_BUILDING_CONTEXT,
        sheet: { snap: "peek" },
      };
      history = "push";
      break;
    case "close-selection":
      next = {
        ...state,
        selection: { kind: "none" },
        buildingContext: EMPTY_BUILDING_CONTEXT,
        sheet: { snap: "hidden" },
      };
      history = "push";
      break;
    case "set-map-category":
      next = {
        ...state,
        mapFilter: { ...state.mapFilter, category: action.category },
      };
      break;
    case "set-map-query":
      next = {
        ...state,
        mapFilter: { ...state.mapFilter, query: action.query },
      };
      break;
    case "set-building-floor":
      next = {
        ...state,
        selection:
          state.selection.kind === "facility" ||
          state.selection.kind === "content"
            ? { kind: "building", buildingId: state.selection.buildingId }
            : state.selection,
        buildingContext: { ...state.buildingContext, floorId: action.floorId },
      };
      break;
    case "set-building-amenity":
      next = {
        ...state,
        selection:
          state.selection.kind === "facility" ||
          state.selection.kind === "content"
            ? { kind: "building", buildingId: state.selection.buildingId }
            : state.selection,
        buildingContext: { ...state.buildingContext, amenity: action.amenity },
      };
      break;
    case "set-building-query":
      next = {
        ...state,
        buildingContext: { ...state.buildingContext, query: action.query },
      };
      break;
    case "set-sheet-snap":
      next = { ...state, sheet: { snap: action.snap } };
      break;
  }

  return { state: canonicalizeCampusMapState(next, catalog), history };
}
