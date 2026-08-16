import type {
  CampusMapCameraCommand,
  CampusMapOverlayCommand,
  CampusMapSessionTransition,
} from "./map-session";
import type { CampusMapSheetSnap } from "./map-state";
import { resolveCampusMapSessionSemantics } from "./scene-semantics";

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
      source: "map" | "building" | "search";
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
  const resolved = resolveCampusMapSessionSemantics(session, catalog);
  return resolved.status === "valid"
    ? { status: "valid", session, context: resolved.context }
    : resolved;
}

export function transitionCampusMapSession(
  session: CampusMapSession,
  event: CampusMapEvent,
  catalog: CampusMapSceneCatalog,
): CampusMapTransition {
  if (event.type === "RESTORE") {
    const requested = resolveCampusMapSessionSemantics(event.session, catalog);
    const restored =
      requested.status === "valid" &&
      requested.persistence.kind === "persistent"
        ? requested
        : null;
    const restoredSession = restored?.session ?? EMPTY_CAMPUS_MAP_SCENE_SESSION;
    return {
      status: "accepted",
      session: restoredSession,
      commands: {
        history: historyCommandFor("restore"),
        camera: restored?.buildingId
          ? {
              kind: "focus",
              buildingId: restored.buildingId,
              reason: "deep-link",
            }
          : { kind: "cancel" },
        focus: restored?.focus ?? { kind: "map" },
        overlay: { kind: "close-external" },
      },
    };
  }

  const current = resolveCampusMapSessionSemantics(session, catalog);
  if (current.status === "invalid") {
    return reject(session, "invalid-session");
  }

  if (event.type === "START_CREATE") {
    if (session.mode !== "browse") {
      return reject(session, "event-not-allowed");
    }
    return {
      status: "accepted",
      session: {
        mode: "task",
        task: {
          kind: "create",
          anchor: current.contributionAnchor,
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
    if (session.scene.floorId === event.floorId) return acceptNoop(session);
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: { ...session.scene, floorId: event.floorId },
    };
    if (
      resolveCampusMapSessionSemantics(candidate, catalog).status === "invalid"
    ) {
      return reject(session, "unknown-floor");
    }
    return {
      status: "accepted",
      session: candidate,
      commands: {
        history: historyCommandFor("refine"),
        camera: null,
        focus: { kind: "results" },
        overlay: null,
      },
    };
  }

  if (event.type === "SEARCH") {
    const query = event.query.trimStart();
    const hasQuery = query.trim().length > 0;
    if (
      (!hasQuery && session.scene.kind === "map") ||
      (session.scene.kind === "search-results" && session.scene.query === query)
    ) {
      return acceptNoop(session);
    }
    return {
      status: "accepted",
      session: hasQuery
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
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: {
        kind: "building",
        buildingId: event.buildingId,
        floorId: null,
        snap: "peek",
      },
    };
    if (
      resolveCampusMapSessionSemantics(candidate, catalog).status === "invalid"
    ) {
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
      session: candidate,
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
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: { kind: "facility", facilityId: event.facilityId, snap: "peek" },
    };
    const resolved = resolveCampusMapSessionSemantics(candidate, catalog);
    if (resolved.status === "invalid" || !resolved.buildingId) {
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
          event.source === "building"
            ? { kind: "cancel" }
            : {
                kind: "focus",
                buildingId: resolved.buildingId,
                reason:
                  event.source === "search"
                    ? "search-selection"
                    : "facility-selection",
              },
        focus: { kind: "heading" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "OPEN_CONTENT") {
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: { kind: "content", contentId: event.contentId, snap: "full" },
    };
    const resolved = resolveCampusMapSessionSemantics(candidate, catalog);
    if (resolved.status === "invalid" || !resolved.buildingId) {
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
                buildingId: resolved.buildingId,
                reason: "map-selection",
              }
            : { kind: "cancel" },
        focus: { kind: "heading" },
        overlay: { kind: "close-external" },
      },
    };
  }

  if (event.type === "OPEN_PROVIDER_POI") {
    const providerPoiId = event.providerPoiId;
    const name = event.name.trim();
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: {
        kind: "provider-poi",
        provider: "amap",
        providerPoiId,
        name,
        position: event.position,
      },
    };
    const resolved = resolveCampusMapSessionSemantics(candidate, catalog);
    if (resolved.status === "invalid") return reject(session, resolved.reason);
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
      session: resolved.session,
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

  const candidate: CampusMapSession = {
    mode: "browse",
    scene: {
      kind: "category-results",
      category: event.category,
      snap: "peek",
    },
  };
  const resolved = resolveCampusMapSessionSemantics(candidate, catalog);
  if (resolved.status === "invalid") return reject(session, resolved.reason);
  if (
    session.scene.kind === "category-results" &&
    session.scene.category === event.category
  ) {
    return acceptNoop(session);
  }
  return {
    status: "accepted",
    session: resolved.session,
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
