import {
  EMPTY_CAMPUS_MAP_STATE,
  reduceCampusMapState,
  type CampusMapCatalog,
  type CampusMapHistoryMode,
  type CampusMapSheetSnap,
  type CampusMapState,
} from "./map-state";
import type { CameraReason } from "./camera-policy";

/**
 * Browse-only session used by the AMap prototype.
 *
 * Contribution workflows deliberately do not live here. They are a separate
 * product mode and are implemented by the canonical scene kernel follow-up.
 */
export type CampusMapSession = {
  browse: CampusMapState;
  entityReturnTarget: CampusMapState | null;
};

export type CampusMapSessionCommand =
  | {
      type: "open-building";
      buildingId: string;
      source: "map" | "search";
    }
  | {
      type: "open-facility";
      facilityId: string;
      source: "map" | "building";
    }
  | {
      type: "open-content";
      contentId: string;
      source: "map" | "building";
    }
  | {
      type: "open-external";
      externalId: string;
      name: string;
      position: readonly [number, number];
    }
  | { type: "set-map-query"; query: string }
  | { type: "toggle-map-category"; category: string }
  | { type: "clear-map-category" }
  | { type: "set-sheet-snap"; snap: CampusMapSheetSnap }
  | { type: "set-building-floor"; floorId: string | null }
  | { type: "set-building-amenity"; amenity: string | null }
  | { type: "set-building-query"; query: string }
  | {
      type: "restore";
      session: CampusMapSession;
      cameraReason?: "map-selection" | "deep-link";
    }
  | {
      type: "reframe-selection";
      reason: "map-selection" | "deep-link" | "sheet-layout";
    }
  | { type: "navigate-back" }
  | { type: "dismiss-entity" };

export type CampusMapCameraCommand =
  | { kind: "focus"; buildingId: string; reason: CameraReason }
  | { kind: "focus-place"; placeId: string; reason: CameraReason }
  | { kind: "cancel" };

export type CampusMapOverlayCommand =
  | {
      kind: "open-external";
      externalId: string;
      name: string;
      position: readonly [number, number];
    }
  | { kind: "close-external" };

export type CampusMapSessionTransition = {
  session: CampusMapSession;
  history: CampusMapHistoryMode | "back-or-push";
  camera: CampusMapCameraCommand | null;
  overlay: CampusMapOverlayCommand | null;
};

export const EMPTY_CAMPUS_MAP_SESSION: CampusMapSession = {
  browse: EMPTY_CAMPUS_MAP_STATE,
  entityReturnTarget: null,
};

export function initialCampusMapSession(
  browse: CampusMapState,
  catalog: CampusMapCatalog,
): CampusMapSession {
  let entityReturnTarget: CampusMapState | null = null;
  if (
    browse.selection.kind === "facility" ||
    browse.selection.kind === "content"
  ) {
    entityReturnTarget = browse.mapFilter.category
      ? reduceCampusMapState(
          browse,
          {
            type: "open-category-results",
            category: browse.mapFilter.category,
          },
          catalog,
        ).state
      : reduceCampusMapState(browse, { type: "return-to-building" }, catalog)
          .state;
  }
  return { browse, entityReturnTarget };
}

function selectedBuildingId(state: CampusMapState) {
  return state.selection.kind === "building" ||
    state.selection.kind === "facility" ||
    state.selection.kind === "content"
    ? state.selection.buildingId
    : null;
}

function browseTransition(
  session: CampusMapSession,
  action:
    | { type: "set-map-query"; query: string }
    | { type: "set-map-category"; category: string | null }
    | { type: "open-category-results"; category: string }
    | { type: "set-sheet-snap"; snap: CampusMapSheetSnap }
    | { type: "set-building-floor"; floorId: string | null }
    | { type: "set-building-amenity"; amenity: string | null }
    | { type: "set-building-query"; query: string },
  catalog: CampusMapCatalog,
): CampusMapSessionTransition {
  const result = reduceCampusMapState(session.browse, action, catalog);
  const clearedEntity =
    session.browse.selection.kind !== "none" &&
    result.state.selection.kind === "none";
  return {
    session: {
      browse: result.state,
      entityReturnTarget: clearedEntity ? null : session.entityReturnTarget,
    },
    history: result.history,
    camera:
      action.type === "set-sheet-snap" ||
      action.type === "set-building-floor" ||
      action.type === "set-building-amenity" ||
      action.type === "set-building-query"
        ? null
        : { kind: "cancel" },
    overlay:
      clearedEntity && session.browse.selection.kind === "external"
        ? { kind: "close-external" }
        : null,
  };
}

export function reduceCampusMapSession(
  session: CampusMapSession,
  command: CampusMapSessionCommand,
  catalog: CampusMapCatalog,
): CampusMapSessionTransition {
  if (command.type === "restore") {
    const buildingId = selectedBuildingId(command.session.browse);
    const closesTransientExternal =
      session.browse.selection.kind === "external";
    return {
      session: command.session,
      history: "none",
      camera:
        buildingId && command.cameraReason
          ? { kind: "focus", buildingId, reason: command.cameraReason }
          : { kind: "cancel" },
      overlay: closesTransientExternal ? { kind: "close-external" } : null,
    };
  }

  if (command.type === "reframe-selection") {
    const buildingId = selectedBuildingId(session.browse);
    return {
      session,
      history: "none",
      camera: buildingId
        ? { kind: "focus", buildingId, reason: command.reason }
        : null,
      overlay: null,
    };
  }

  if (command.type === "open-building") {
    const result = reduceCampusMapState(
      session.browse,
      { type: "select-building", buildingId: command.buildingId },
      catalog,
    );
    return {
      session: {
        browse: result.state,
        entityReturnTarget: session.browse,
      },
      history: result.history,
      camera: {
        kind: "focus",
        buildingId: command.buildingId,
        reason:
          command.source === "search" ? "search-selection" : "map-selection",
      },
      overlay: { kind: "close-external" },
    };
  }

  if (command.type === "open-facility") {
    const facility = catalog.facilities[command.facilityId];
    const result = reduceCampusMapState(
      session.browse,
      { type: "select-facility", facilityId: command.facilityId },
      catalog,
    );
    return {
      session: {
        browse: result.state,
        entityReturnTarget: session.browse,
      },
      history: result.history,
      camera:
        command.source === "map" && facility
          ? {
              kind: "focus",
              buildingId: facility.buildingId,
              reason: "facility-selection",
            }
          : { kind: "cancel" },
      overlay: { kind: "close-external" },
    };
  }

  if (command.type === "open-content") {
    const content = catalog.contents?.[command.contentId];
    const result = reduceCampusMapState(
      session.browse,
      { type: "select-content", contentId: command.contentId },
      catalog,
    );
    return {
      session: {
        browse: result.state,
        entityReturnTarget: session.browse,
      },
      history: result.history,
      camera:
        command.source === "map" && content
          ? {
              kind: "focus",
              buildingId: content.buildingId,
              reason: "map-selection",
            }
          : { kind: "cancel" },
      overlay: { kind: "close-external" },
    };
  }

  if (command.type === "open-external") {
    const result = reduceCampusMapState(
      session.browse,
      {
        type: "select-external",
        externalId: command.externalId,
        position: command.position,
      },
      catalog,
    );
    return {
      session: { browse: result.state, entityReturnTarget: null },
      history: result.history,
      camera: { kind: "cancel" },
      overlay: {
        kind: "open-external",
        externalId: command.externalId,
        name: command.name,
        position: command.position,
      },
    };
  }

  if (command.type === "set-map-query") {
    return browseTransition(session, command, catalog);
  }

  if (command.type === "toggle-map-category") {
    const action =
      session.browse.selection.kind !== "none"
        ? { type: "open-category-results" as const, category: command.category }
        : {
            type: "set-map-category" as const,
            category:
              session.browse.mapFilter.category === command.category
                ? null
                : command.category,
          };
    return browseTransition(session, action, catalog);
  }

  if (command.type === "clear-map-category") {
    return browseTransition(
      session,
      { type: "set-map-category", category: null },
      catalog,
    );
  }

  if (
    command.type === "set-sheet-snap" ||
    command.type === "set-building-floor" ||
    command.type === "set-building-amenity" ||
    command.type === "set-building-query"
  ) {
    return browseTransition(session, command, catalog);
  }

  if (command.type === "navigate-back") {
    return session.entityReturnTarget
      ? {
          session: {
            browse: session.entityReturnTarget,
            entityReturnTarget: null,
          },
          history: "back-or-push",
          camera: { kind: "cancel" },
          overlay: { kind: "close-external" },
        }
      : {
          session,
          history: "none",
          camera: { kind: "cancel" },
          overlay: null,
        };
  }

  const result = reduceCampusMapState(
    session.browse,
    { type: "close-selection" },
    catalog,
  );
  return {
    session: { browse: result.state, entityReturnTarget: null },
    history: "replace",
    camera: { kind: "cancel" },
    overlay: { kind: "close-external" },
  };
}
