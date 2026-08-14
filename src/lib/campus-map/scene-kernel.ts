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

type NavigationClass =
  | "enter"
  | "refine"
  | "transient"
  | "restore"
  | "return"
  | "noop";

function historyCommandFor(
  navigation: NavigationClass,
): CampusMapSceneCommands["history"] {
  switch (navigation) {
    case "enter":
      return "push";
    case "refine":
      return "replace";
    case "return":
      return "back-or-push";
    case "transient":
    case "restore":
    case "noop":
      return null;
  }
}

function reject(
  session: CampusMapSession,
  reason: string,
): CampusMapTransition {
  return { status: "rejected", reason, session, commands: NO_COMMANDS };
}

function acceptNoop(session: CampusMapSession): CampusMapTransition {
  return {
    status: "accepted",
    session,
    commands: { ...NO_COMMANDS, history: historyCommandFor("noop") },
  };
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
    return session.scene.query === session.scene.query.trim() &&
      session.scene.query.length > 0
      ? { status: "valid", session, context: null }
      : { status: "invalid", reason: "invalid-query" };
  }
  if (session.scene.kind === "provider-poi") {
    return session.scene.providerPoiId === session.scene.providerPoiId.trim() &&
      session.scene.providerPoiId.length > 0 &&
      session.scene.name === session.scene.name.trim() &&
      session.scene.name.length > 0 &&
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
  session: CampusMapSession,
  event: CampusMapEvent,
  catalog: CampusMapSceneCatalog,
): CampusMapTransition {
  if (event.type === "RESTORE") {
    const transientProvider =
      event.session.mode === "browse" &&
      event.session.scene.kind === "provider-poi";
    const resolved = resolveCampusMapScene(event.session, catalog);
    const restoredSession =
      !transientProvider && resolved.status === "valid"
        ? event.session
        : EMPTY_CAMPUS_MAP_SCENE_SESSION;
    const buildingId = sessionBuildingId(restoredSession, catalog);
    const focus: CampusMapFocusCommand =
      restoredSession.mode === "task"
        ? { kind: "contribution-form" }
        : restoredSession.scene.kind === "map"
          ? { kind: "map" }
          : restoredSession.scene.kind === "search-results"
            ? { kind: "search-input" }
            : restoredSession.scene.kind === "category-results"
              ? { kind: "results" }
              : { kind: "heading" };
    return {
      status: "accepted",
      session: restoredSession,
      commands: {
        history: historyCommandFor("restore"),
        camera: buildingId
          ? { kind: "focus", buildingId, reason: "deep-link" }
          : { kind: "cancel" },
        focus,
        overlay: { kind: "close-external" },
      },
    };
  }

  if (resolveCampusMapScene(session, catalog).status === "invalid") {
    return reject(session, "invalid-session");
  }

  if (event.type === "START_CREATE") {
    if (session.mode !== "browse") {
      return reject(session, "event-not-allowed");
    }
    const scene = session.scene;
    let buildingId: string | null = null;
    if (scene.kind === "building") buildingId = scene.buildingId;
    if (scene.kind === "facility") {
      buildingId = catalog.facilities[scene.facilityId]?.buildingId ?? null;
    }
    if (scene.kind === "content") {
      buildingId = catalog.contents[scene.contentId]?.buildingId ?? null;
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
        history: historyCommandFor("enter"),
        camera: { kind: "cancel" },
        focus: { kind: "contribution-form" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "CANCEL_TASK") {
    if (session.mode !== "task") {
      return reject(session, "event-not-allowed");
    }
    const anchor = session.task.anchor;
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
        history: historyCommandFor("return"),
        camera: { kind: "cancel" },
        focus:
          anchor.kind === "building" ? { kind: "heading" } : { kind: "map" },
        overlay: null,
      },
    };
  }

  if (session.mode !== "browse") {
    return reject(session, "event-not-allowed");
  }

  if (event.type === "OPEN_MAP") {
    if (session.scene.kind === "map") return acceptNoop(session);
    return {
      status: "accepted",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      commands: {
        history: historyCommandFor("refine"),
        camera: { kind: "cancel" },
        focus: { kind: "map" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "SET_SNAP") {
    if (session.scene.kind === "map" || session.scene.kind === "provider-poi") {
      return reject(session, "event-not-allowed");
    }
    if (session.scene.snap === event.snap) return acceptNoop(session);
    return {
      status: "accepted",
      session: {
        mode: "browse",
        scene: { ...session.scene, snap: event.snap },
      },
      commands: {
        history: historyCommandFor("refine"),
        camera: null,
        focus: event.snap === "full" ? { kind: "heading" } : null,
        overlay: null,
      },
    };
  }

  if (event.type === "SET_BUILDING_FLOOR") {
    if (session.scene.kind !== "building") {
      return reject(session, "event-not-allowed");
    }
    if (
      event.floorId !== null &&
      !catalog.buildings[session.scene.buildingId]?.floorIds.includes(
        event.floorId,
      )
    ) {
      return reject(session, "unknown-floor");
    }
    if (session.scene.floorId === event.floorId) return acceptNoop(session);
    return {
      status: "accepted",
      session: {
        mode: "browse",
        scene: { ...session.scene, floorId: event.floorId },
      },
      commands: {
        history: historyCommandFor("refine"),
        camera: null,
        focus: { kind: "results" },
        overlay: null,
      },
    };
  }

  if (event.type === "SEARCH") {
    const query = event.query.trim();
    if (
      (query === "" && session.scene.kind === "map") ||
      (session.scene.kind === "search-results" && session.scene.query === query)
    ) {
      return acceptNoop(session);
    }
    return {
      status: "accepted",
      session: query
        ? {
            mode: "browse",
            scene: { kind: "search-results", query, snap: "peek" },
          }
        : EMPTY_CAMPUS_MAP_SCENE_SESSION,
      commands: {
        history: historyCommandFor("refine"),
        camera: { kind: "cancel" },
        focus: { kind: "search-input" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "OPEN_BUILDING") {
    if (!catalog.buildings[event.buildingId]) {
      return reject(session, "unknown-building");
    }
    if (
      session.scene.kind === "building" &&
      session.scene.buildingId === event.buildingId
    ) {
      return acceptNoop(session);
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
        history: historyCommandFor("enter"),
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
    const facility = catalog.facilities[event.facilityId];
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: { kind: "facility", facilityId: event.facilityId, snap: "peek" },
    };
    const resolved = resolveCampusMapScene(candidate, catalog);
    if (resolved.status === "invalid" || !facility) {
      return reject(session, "unknown-facility");
    }
    if (
      session.scene.kind === "facility" &&
      session.scene.facilityId === event.facilityId
    ) {
      return acceptNoop(session);
    }
    return {
      status: "accepted",
      session: candidate,
      commands: {
        history: historyCommandFor("enter"),
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
    const content = catalog.contents[event.contentId];
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: { kind: "content", contentId: event.contentId, snap: "full" },
    };
    if (
      !content ||
      resolveCampusMapScene(candidate, catalog).status === "invalid"
    ) {
      return reject(session, "unknown-content");
    }
    if (
      session.scene.kind === "content" &&
      session.scene.contentId === event.contentId
    ) {
      return acceptNoop(session);
    }
    return {
      status: "accepted",
      session: candidate,
      commands: {
        history: historyCommandFor("enter"),
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
      return reject(session, "invalid-provider-poi");
    }
    if (
      session.scene.kind === "provider-poi" &&
      session.scene.providerPoiId === providerPoiId &&
      session.scene.name === name &&
      session.scene.position[0] === event.position[0] &&
      session.scene.position[1] === event.position[1]
    ) {
      return acceptNoop(session);
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
        history: historyCommandFor("transient"),
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

  if (!catalog.categories.includes(event.category)) {
    return reject(session, "unknown-category");
  }
  if (
    session.scene.kind === "category-results" &&
    session.scene.category === event.category
  ) {
    return acceptNoop(session);
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
      history: historyCommandFor(
        session.scene.kind === "building" ||
          session.scene.kind === "facility" ||
          session.scene.kind === "content"
          ? "enter"
          : "refine",
      ),
      camera: { kind: "cancel" },
      focus: { kind: "results" },
      overlay: { kind: "close-external" },
    },
  };
}
