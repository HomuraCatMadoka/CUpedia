import type { CameraReason } from "@/lib/campus-map/camera-policy";
import {
  projectCampusMapReturnFocus,
  projectCampusMapSceneCameraCommand,
  resolveCampusMapSessionSemantics,
} from "@/lib/campus-map/scene-semantics";

/**
 * Pure product kernel layered on the #593 ports. AMap browse events, camera
 * execution, browser history, and MarkerCluster failure handling remain owned
 * by their dedicated runtime boundaries.
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
      kind: "place";
      placeId: string;
      snap: "peek";
    }
  | {
      kind: "content";
      contentId: string;
      snap: Exclude<CampusMapSheetSnap, "hidden">;
    };

export type CampusMapContributionTask =
  | {
      kind: "create";
      anchor: { kind: "map" } | { kind: "building"; buildingId: string };
    }
  | {
      kind: "edit";
      placeId: string;
      returnContext?: CampusMapTaskReturnContext;
    };

export type CampusMapTaskReturnContext = {
  kind: "map-note";
  noteId: string;
};

export type CampusMapSession =
  | { mode: "browse"; scene: CampusMapBrowseScene }
  | { mode: "task"; task: CampusMapContributionTask };

export interface CampusMapSceneCatalog {
  readonly categories: readonly string[];
  readonly buildings: Readonly<
    Record<string, { floorIds: readonly string[] } | undefined>
  >;
  readonly places: Readonly<
    Record<
      string,
      | {
          buildingId: string | null;
          floorId: string | null;
          category: string;
          cameraTarget?: "building-anchor" | "place-point" | null;
        }
      | undefined
    >
  >;
  readonly contents: Readonly<
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
      type: "OPEN_PLACE";
      placeId: string;
      source: "map" | "building" | "search";
    }
  | {
      type: "OPEN_CONTENT";
      contentId: string;
      source: "map" | "building";
    }
  | { type: "SET_SNAP"; snap: Exclude<CampusMapSheetSnap, "hidden"> }
  | { type: "SET_BUILDING_FLOOR"; floorId: string | null }
  | { type: "START_CREATE" }
  | { type: "START_EDIT"; placeId: string }
  | { type: "CANCEL_TASK" }
  | { type: "RESTORE"; session: CampusMapSession };

export type CampusMapFocusTarget =
  | { kind: "map" }
  | { kind: "search-input" }
  | { kind: "results" }
  | { kind: "heading" }
  | { kind: "contribution-form" };

export type CampusMapFocusCommand =
  | CampusMapFocusTarget
  | {
      kind: "result";
      resultId: string;
      fallback: CampusMapFocusTarget;
    }
  | {
      kind: "category-filter";
      category: string;
      fallback: CampusMapFocusTarget;
    };

export type CampusMapSheetSnap = "hidden" | "peek" | "full";

export type CampusMapCameraCommand =
  | { kind: "focus"; buildingId: string; reason: CameraReason }
  | { kind: "focus-place"; placeId: string; reason: CameraReason }
  | { kind: "cancel" };

export type CampusMapSceneCommands = {
  history: "push" | "replace" | "back-or-push" | null;
  camera: CampusMapCameraCommand | null;
  focus: CampusMapFocusCommand | null;
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
};

type NavigationClass = "enter" | "refine" | "restore" | "return" | "noop";

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
        buildingId: string | null;
        floorId: string | null;
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
    ? {
        status: "valid",
        session: resolved.session,
        context: resolved.context,
      }
    : resolved;
}

export function transitionCampusMapSession(
  session: CampusMapSession,
  event: CampusMapEvent,
  catalog: CampusMapSceneCatalog,
): CampusMapTransition {
  if (event.type === "RESTORE") {
    const requested = resolveCampusMapSessionSemantics(event.session, catalog);
    const restored = requested.status === "valid" ? requested : null;
    const restoredSession = restored?.session ?? EMPTY_CAMPUS_MAP_SCENE_SESSION;
    return {
      status: "accepted",
      session: restoredSession,
      commands: {
        history: historyCommandFor("restore"),
        camera: restored
          ? (projectCampusMapSceneCameraCommand(
              restored.cameraTarget,
              "deep-link",
            ) ?? { kind: "cancel" })
          : { kind: "cancel" },
        focus: restored
          ? projectCampusMapReturnFocus(session, restored, catalog)
          : { kind: "map" },
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
      },
    };
  }

  if (event.type === "START_EDIT") {
    if (session.mode !== "browse") {
      return reject(session, "event-not-allowed");
    }
    const candidate: CampusMapSession = {
      mode: "task",
      task: { kind: "edit", placeId: event.placeId },
    };
    const resolved = resolveCampusMapSessionSemantics(candidate, catalog);
    if (resolved.status === "invalid") return reject(session, resolved.reason);
    return {
      status: "accepted",
      session: candidate,
      commands: {
        history: historyCommandFor("enter"),
        camera: { kind: "cancel" },
        focus: { kind: "contribution-form" },
      },
    };
  }

  if (event.type === "CANCEL_TASK") {
    if (session.mode !== "task") {
      return reject(session, "event-not-allowed");
    }
    const anchor = current.contributionAnchor;
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
      },
    };
  }

  if (event.type === "SET_SNAP") {
    if (session.scene.kind === "map") {
      return reject(session, "event-not-allowed");
    }
    if (session.scene.kind === "place") {
      return event.snap === "peek"
        ? acceptNoop(session)
        : reject(session, "event-not-allowed");
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
      },
    };
  }

  if (event.type === "OPEN_PLACE") {
    const candidate: CampusMapSession = {
      mode: "browse",
      scene: { kind: "place", placeId: event.placeId, snap: "peek" },
    };
    const resolved = resolveCampusMapSessionSemantics(candidate, catalog);
    if (resolved.status === "invalid") {
      return reject(session, "unknown-place");
    }
    if (
      session.scene.kind === "place" &&
      session.scene.placeId === event.placeId
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
            : (projectCampusMapSceneCameraCommand(
                resolved.cameraTarget,
                event.source === "search"
                  ? "search-selection"
                  : "place-selection",
              ) ?? { kind: "cancel" }),
        focus: { kind: "heading" },
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
    session: candidate,
    commands: {
      history: historyCommandFor(
        session.scene.kind === "building" ||
          session.scene.kind === "place" ||
          session.scene.kind === "content"
          ? "enter"
          : "refine",
      ),
      camera: { kind: "cancel" },
      focus: { kind: "results" },
    },
  };
}
