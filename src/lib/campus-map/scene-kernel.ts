import type {
  CampusMapCameraCommand,
  CampusMapOverlayCommand,
  CampusMapSessionTransition,
} from "./map-session";
import type { CampusMapSheetSnap } from "./map-state";

/**
 * Pure product kernel layered on the #593 ports. Provider gesture arbitration,
 * camera execution, overlay lifecycle, browser history, and MarkerCluster
 * failure handling remain owned by their existing adapters and runtimes.
 */

export type CampusMapBrowseScene =
  | { kind: "map" }
  | {
      kind: "search-results";
      query: string;
      snap: Exclude<CampusMapSheetSnap, "hidden">;
    }
  | {
      kind: "category-results";
      category: string;
      snap: Exclude<CampusMapSheetSnap, "hidden">;
    }
  | {
      kind: "building";
      buildingId: string;
      floorId: string | null;
      snap: Exclude<CampusMapSheetSnap, "hidden">;
    }
  | {
      kind: "facility";
      facilityId: string;
      snap: Exclude<CampusMapSheetSnap, "hidden">;
    }
  | {
      kind: "content";
      contentId: string;
      snap: Exclude<CampusMapSheetSnap, "hidden">;
    }
  | {
      kind: "provider-poi";
      provider: "amap";
      providerPoiId: string;
      name: string;
      position: readonly [longitude: number, latitude: number];
    };

export type CampusMapContributionTask = {
  kind: "create";
  anchor: { kind: "map" } | { kind: "building"; buildingId: string };
};

export type CampusMapSession =
  | { mode: "browse"; scene: CampusMapBrowseScene }
  | { mode: "task"; task: CampusMapContributionTask };

export interface CampusMapSceneCatalog {
  categories: readonly string[];
  buildings: Readonly<
    Record<string, { floorIds: readonly string[] } | undefined>
  >;
  facilities: Readonly<
    Record<
      string,
      { buildingId: string; floorId: string; category: string } | undefined
    >
  >;
  contents: Readonly<
    Record<
      string,
      | {
          buildingId: string;
          floorId: string;
          category: string;
          kind: string;
        }
      | undefined
    >
  >;
}

export type CampusMapEvent =
  | { type: "OPEN_MAP" }
  | { type: "SEARCH"; query: string }
  | { type: "OPEN_CATEGORY"; category: string }
  | {
      type: "OPEN_BUILDING";
      buildingId: string;
      source: "map" | "search";
    }
  | {
      type: "OPEN_FACILITY";
      facilityId: string;
      source: "map" | "building";
    }
  | {
      type: "OPEN_CONTENT";
      contentId: string;
      source: "map" | "building";
    }
  | {
      type: "OPEN_PROVIDER_POI";
      providerPoiId: string;
      name: string;
      position: readonly [longitude: number, latitude: number];
    }
  | { type: "SET_SNAP"; snap: Exclude<CampusMapSheetSnap, "hidden"> }
  | { type: "SET_BUILDING_FLOOR"; floorId: string | null }
  | { type: "START_CREATE" }
  | { type: "CANCEL_TASK" }
  | { type: "RESTORE"; session: CampusMapSession };

export type CampusMapFocusCommand =
  | { kind: "map" }
  | { kind: "search-input" }
  | { kind: "results" }
  | { kind: "heading" }
  | { kind: "contribution-form" };

export type CampusMapSceneCommands = {
  history: CampusMapSessionTransition["history"] | null;
  camera: CampusMapCameraCommand | null;
  focus: CampusMapFocusCommand | null;
  overlay: CampusMapOverlayCommand | null;
};

export type CampusMapTransition =
  | {
      status: "accepted";
      session: CampusMapSession;
      commands: CampusMapSceneCommands;
    }
  | {
      status: "rejected";
      reason: string;
      session: CampusMapSession;
      commands: CampusMapSceneCommands;
    };

export const EMPTY_CAMPUS_MAP_SCENE_SESSION: CampusMapSession = {
  mode: "browse",
  scene: { kind: "map" },
};

const NO_COMMANDS: CampusMapSceneCommands = {
  history: null,
  camera: null,
  focus: null,
  overlay: null,
};

function reject(
  session: CampusMapSession,
  reason: string,
): CampusMapTransition {
  return { status: "rejected", reason, session, commands: NO_COMMANDS };
}

export type CampusMapResolvedScene =
  | {
      status: "valid";
      session: CampusMapSession;
      context: {
        buildingId: string;
        floorId: string;
        category: string;
      } | null;
    }
  | { status: "invalid"; reason: string };

export function resolveCampusMapScene(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
): CampusMapResolvedScene {
  if (session.mode === "task") {
    if (
      session.task.anchor.kind === "building" &&
      !catalog.buildings[session.task.anchor.buildingId]
    ) {
      return { status: "invalid", reason: "unknown-building" };
    }
    return { status: "valid", session, context: null };
  }
  if (session.scene.kind === "building") {
    const building = catalog.buildings[session.scene.buildingId];
    if (
      !building ||
      (session.scene.floorId !== null &&
        !building.floorIds.includes(session.scene.floorId))
    ) {
      return { status: "invalid", reason: "unknown-building" };
    }
    return { status: "valid", session, context: null };
  }
  if (session.scene.kind === "category-results") {
    return catalog.categories.includes(session.scene.category)
      ? { status: "valid", session, context: null }
      : { status: "invalid", reason: "unknown-category" };
  }
  if (session.scene.kind === "search-results") {
    return session.scene.query.trim()
      ? { status: "valid", session, context: null }
      : { status: "invalid", reason: "invalid-query" };
  }
  if (session.scene.kind === "provider-poi") {
    return session.scene.providerPoiId.trim() &&
      session.scene.name.trim() &&
      validPosition(session.scene.position)
      ? { status: "valid", session, context: null }
      : { status: "invalid", reason: "invalid-provider-poi" };
  }
  if (session.scene.kind !== "facility" && session.scene.kind !== "content") {
    return { status: "valid", session, context: null };
  }
  const entity =
    session.scene.kind === "facility"
      ? catalog.facilities[session.scene.facilityId]
      : catalog.contents[session.scene.contentId];
  if (
    !entity ||
    !catalog.buildings[entity.buildingId]?.floorIds.includes(entity.floorId) ||
    !catalog.categories.includes(entity.category)
  ) {
    return {
      status: "invalid",
      reason:
        session.scene.kind === "facility"
          ? "unknown-facility"
          : "unknown-content",
    };
  }
  return {
    status: "valid",
    session,
    context: {
      buildingId: entity.buildingId,
      floorId: entity.floorId,
      category: entity.category,
    },
  };
}

function validPosition(position: readonly [number, number]) {
  return (
    Number.isFinite(position[0]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    Number.isFinite(position[1]) &&
    position[1] >= -90 &&
    position[1] <= 90
  );
}

function sessionBuildingId(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
) {
  if (session.mode === "task") {
    return session.task.anchor.kind === "building"
      ? session.task.anchor.buildingId
      : null;
  }
  if (session.scene.kind === "building") return session.scene.buildingId;
  if (session.scene.kind === "facility") {
    return catalog.facilities[session.scene.facilityId]?.buildingId ?? null;
  }
  if (session.scene.kind === "content") {
    return catalog.contents[session.scene.contentId]?.buildingId ?? null;
  }
  return null;
}

export function transitionCampusMapSession(
  _session: CampusMapSession,
  event: CampusMapEvent,
  _catalog: CampusMapSceneCatalog,
): CampusMapTransition {
  if (event.type === "RESTORE") {
    const resolved = resolveCampusMapScene(event.session, _catalog);
    const session =
      resolved.status === "valid"
        ? event.session
        : EMPTY_CAMPUS_MAP_SCENE_SESSION;
    const buildingId = sessionBuildingId(session, _catalog);
    const providerScene =
      session.mode === "browse" && session.scene.kind === "provider-poi"
        ? session.scene
        : null;
    const focus: CampusMapFocusCommand =
      session.mode === "task"
        ? { kind: "contribution-form" }
        : session.scene.kind === "map" || session.scene.kind === "provider-poi"
          ? { kind: "map" }
          : session.scene.kind === "search-results"
            ? { kind: "search-input" }
            : session.scene.kind === "category-results"
              ? { kind: "results" }
              : { kind: "heading" };
    return {
      status: "accepted",
      session,
      commands: {
        history: null,
        camera: buildingId
          ? { kind: "focus", buildingId, reason: "deep-link" }
          : { kind: "cancel" },
        focus,
        overlay: providerScene
          ? {
              kind: "open-external",
              externalId: providerScene.providerPoiId,
              name: providerScene.name,
              position: providerScene.position,
            }
          : { kind: "close-external" },
      },
    };
  }

  if (event.type === "START_CREATE") {
    if (_session.mode !== "browse") {
      return reject(_session, "event-not-allowed");
    }
    const scene = _session.scene;
    let buildingId: string | null = null;
    if (scene.kind === "building") buildingId = scene.buildingId;
    if (scene.kind === "facility") {
      buildingId = _catalog.facilities[scene.facilityId]?.buildingId ?? null;
    }
    if (scene.kind === "content") {
      buildingId = _catalog.contents[scene.contentId]?.buildingId ?? null;
    }
    return {
      status: "accepted",
      session: {
        mode: "task",
        task: {
          kind: "create",
          anchor: buildingId
            ? { kind: "building", buildingId }
            : { kind: "map" },
        },
      },
      commands: {
        history: "push",
        camera: { kind: "cancel" },
        focus: { kind: "contribution-form" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "CANCEL_TASK") {
    if (_session.mode !== "task") {
      return reject(_session, "event-not-allowed");
    }
    const anchor = _session.task.anchor;
    return {
      status: "accepted",
      session:
        anchor.kind === "building"
          ? {
              mode: "browse",
              scene: {
                kind: "building",
                buildingId: anchor.buildingId,
                floorId: null,
                snap: "peek",
              },
            }
          : EMPTY_CAMPUS_MAP_SCENE_SESSION,
      commands: {
        history: "back-or-push",
        camera: { kind: "cancel" },
        focus:
          anchor.kind === "building" ? { kind: "heading" } : { kind: "map" },
        overlay: null,
      },
    };
  }

  if (_session.mode !== "browse") {
    return reject(_session, "event-not-allowed");
  }

  if (event.type === "OPEN_MAP") {
    return {
      status: "accepted",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      commands: {
        history: "replace",
        camera: { kind: "cancel" },
        focus: { kind: "map" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "SET_SNAP") {
    if (
      _session.scene.kind === "map" ||
      _session.scene.kind === "provider-poi"
    ) {
      return reject(_session, "event-not-allowed");
    }
    return {
      status: "accepted",
      session: {
        mode: "browse",
        scene: { ..._session.scene, snap: event.snap },
      },
      commands: {
        history: "replace",
        camera: null,
        focus: event.snap === "full" ? { kind: "heading" } : null,
        overlay: null,
      },
    };
  }

  if (event.type === "SET_BUILDING_FLOOR") {
    if (_session.scene.kind !== "building") {
      return reject(_session, "event-not-allowed");
    }
    if (
      event.floorId !== null &&
      !_catalog.buildings[_session.scene.buildingId]?.floorIds.includes(
        event.floorId,
      )
    ) {
      return reject(_session, "unknown-floor");
    }
    return {
      status: "accepted",
      session: {
        mode: "browse",
        scene: { ..._session.scene, floorId: event.floorId },
      },
      commands: {
        history: "replace",
        camera: null,
        focus: { kind: "results" },
        overlay: null,
      },
    };
  }

  if (event.type === "SEARCH") {
    const query = event.query.trim();
    return {
      status: "accepted",
      session: query
        ? {
            mode: "browse",
            scene: { kind: "search-results", query, snap: "peek" },
          }
        : EMPTY_CAMPUS_MAP_SCENE_SESSION,
      commands: {
        history: "replace",
        camera: { kind: "cancel" },
        focus: { kind: "search-input" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "OPEN_BUILDING") {
    if (!_catalog.buildings[event.buildingId]) {
      return reject(_session, "unknown-building");
    }
    return {
      status: "accepted",
      session: {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: event.buildingId,
          floorId: null,
          snap: "peek",
        },
      },
      commands: {
        history: "push",
        camera: {
          kind: "focus",
          buildingId: event.buildingId,
          reason:
            event.source === "search" ? "search-selection" : "map-selection",
        },
        focus: { kind: "heading" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "OPEN_FACILITY") {
    const facility = _catalog.facilities[event.facilityId];
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: { kind: "facility", facilityId: event.facilityId, snap: "peek" },
    };
    const resolved = resolveCampusMapScene(candidate, _catalog);
    if (resolved.status === "invalid" || !facility) {
      return reject(_session, "unknown-facility");
    }
    return {
      status: "accepted",
      session: candidate,
      commands: {
        history: "push",
        camera:
          event.source === "map" && facility
            ? {
                kind: "focus",
                buildingId: facility.buildingId,
                reason: "facility-selection",
              }
            : { kind: "cancel" },
        focus: { kind: "heading" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "OPEN_CONTENT") {
    const content = _catalog.contents[event.contentId];
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: { kind: "content", contentId: event.contentId, snap: "full" },
    };
    if (
      !content ||
      resolveCampusMapScene(candidate, _catalog).status === "invalid"
    ) {
      return reject(_session, "unknown-content");
    }
    return {
      status: "accepted",
      session: candidate,
      commands: {
        history: "push",
        camera:
          event.source === "map"
            ? {
                kind: "focus",
                buildingId: content.buildingId,
                reason: "map-selection",
              }
            : { kind: "cancel" },
        focus: { kind: "heading" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "OPEN_PROVIDER_POI") {
    const providerPoiId = event.providerPoiId.trim();
    const name = event.name.trim();
    if (!providerPoiId || !name || !validPosition(event.position)) {
      return reject(_session, "invalid-provider-poi");
    }
    return {
      status: "accepted",
      session: {
        mode: "browse",
        scene: {
          kind: "provider-poi",
          provider: "amap",
          providerPoiId,
          name,
          position: event.position,
        },
      },
      commands: {
        history: null,
        camera: { kind: "cancel" },
        focus: { kind: "map" },
        overlay: {
          kind: "open-external",
          externalId: providerPoiId,
          name,
          position: event.position,
        },
      },
    };
  }

  if (!_catalog.categories.includes(event.category)) {
    return reject(_session, "unknown-category");
  }
  return {
    status: "accepted",
    session: {
      mode: "browse",
      scene: {
        kind: "category-results",
        category: event.category,
        snap: "peek",
      },
    },
    commands: {
      history: "push",
      camera: { kind: "cancel" },
      focus: { kind: "results" },
      overlay: { kind: "close-external" },
    },
  };
}
