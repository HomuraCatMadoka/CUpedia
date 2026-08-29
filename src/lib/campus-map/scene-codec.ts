import {
  EMPTY_CAMPUS_MAP_SCENE_SESSION,
  type CampusMapSceneCatalog,
  type CampusMapSession,
} from "./scene-kernel";
import {
  isCanonicalCampusMapId,
  resolveCampusMapSessionSemantics,
  type PersistableCampusMapSession,
} from "./scene-semantics";
import { isCanonicalCampusMapUuid } from "./canonical-uuid";

export const CAMPUS_MAP_SCENE_CODEC_VERSION = 1 as const;

export type CampusMapDecodeResult =
  | { status: "decoded"; session: CampusMapSession }
  | { status: "fallback"; session: CampusMapSession; reason: string };

export type CampusMapHistoryDecodeResult =
  | { status: "decoded"; depth: number }
  | { status: "fallback"; depth: 0; reason: string };

export interface CampusMapHistoryMetadata {
  campusMapScene: true;
  version: typeof CAMPUS_MAP_SCENE_CODEC_VERSION;
  depth: number;
}

function fallback(reason: string): CampusMapDecodeResult {
  return {
    status: "fallback",
    session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
    reason,
  };
}

function paramsFrom(input: URLSearchParams | string) {
  return typeof input === "string"
    ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
    : input;
}

function hasOnlyUrlKeys(
  params: URLSearchParams,
  allowedKeys: readonly string[],
) {
  return Array.from(params.keys()).every((key) => allowedKeys.includes(key));
}

function hasRepeatedUrlKeys(params: URLSearchParams) {
  return Array.from(new Set(params.keys())).some(
    (key) => params.getAll(key).length !== 1,
  );
}

function snap(value: string | null) {
  return value === "peek" || value === "full" ? value : null;
}

function validSession(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
) {
  return resolveCampusMapSessionSemantics(session, catalog).status === "valid";
}

function normalizePersistentSession(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
): PersistableCampusMapSession {
  const resolved = resolveCampusMapSessionSemantics(session, catalog);
  const persistent =
    resolved.status === "valid" && resolved.persistence.kind === "persistent"
      ? resolved.persistence.session
      : ({ mode: "browse", scene: { kind: "map" } } as const);
  return persistent.mode === "browse" && persistent.scene.kind === "facility"
    ? {
        mode: "browse",
        scene: { ...persistent.scene, snap: "peek" },
      }
    : persistent;
}

export function normalizeCampusMapUrlSession(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
): CampusMapSession {
  return normalizePersistentSession(session, catalog);
}

export function encodeCampusMapHistoryMetadata(
  depth: number,
): CampusMapHistoryMetadata {
  return {
    campusMapScene: true,
    version: CAMPUS_MAP_SCENE_CODEC_VERSION,
    depth: Number.isInteger(depth) && depth >= 0 ? depth : 0,
  };
}

export function decodeCampusMapHistoryMetadata(
  value: unknown,
): CampusMapHistoryDecodeResult {
  const historyFallback = (reason: string): CampusMapHistoryDecodeResult => ({
    status: "fallback",
    depth: 0,
    reason,
  });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return historyFallback("invalid-snapshot");
  }
  try {
    const snapshot = value as Record<string, unknown>;
    if (snapshot.campusMapScene !== true) {
      return historyFallback("invalid-snapshot");
    }
    if (snapshot.version !== CAMPUS_MAP_SCENE_CODEC_VERSION) {
      return historyFallback("unsupported-version");
    }
    const allowedKeys = ["campusMapScene", "version", "depth"];
    const keys = Object.keys(snapshot);
    if (
      keys.length !== allowedKeys.length ||
      keys.some((key) => !allowedKeys.includes(key)) ||
      !Number.isInteger(snapshot.depth) ||
      (snapshot.depth as number) < 0
    ) {
      return historyFallback(
        Object.hasOwn(snapshot, "session")
          ? "conflicting-fields"
          : "invalid-snapshot",
      );
    }
    return { status: "decoded", depth: snapshot.depth as number };
  } catch {
    return historyFallback("invalid-snapshot");
  }
}

function encodePersistableCampusMapUrl(
  normalized: PersistableCampusMapSession,
) {
  const params = new URLSearchParams({
    v: String(CAMPUS_MAP_SCENE_CODEC_VERSION),
  });

  if (normalized.mode === "task") {
    params.set("task", normalized.task.kind);
    if (normalized.task.kind === "edit") {
      params.set("id", normalized.task.placeId);
      if (normalized.task.returnContext?.kind === "map-note") {
        params.set("returnNote", normalized.task.returnContext.noteId);
      }
      return params;
    }
    params.set("anchor", normalized.task.anchor.kind);
    if (normalized.task.anchor.kind === "building") {
      params.set("id", normalized.task.anchor.buildingId);
    }
    return params;
  }

  const scene = normalized.scene;
  if (scene.kind === "map") return params;
  if (scene.kind === "search-results") {
    params.set("scene", "search");
    params.set("q", scene.query);
    params.set("snap", scene.snap);
    return params;
  }
  if (scene.kind === "category-results") {
    params.set("scene", "category");
    params.set("id", scene.category);
    params.set("snap", scene.snap);
    return params;
  }
  if (scene.kind === "building") {
    params.set("scene", "building");
    params.set("id", scene.buildingId);
    if (scene.floorId) params.set("floor", scene.floorId);
    params.set("snap", scene.snap);
    return params;
  }
  if (scene.kind === "facility") {
    params.set("scene", "facility");
    params.set("id", scene.facilityId);
    params.set("snap", scene.snap);
    return params;
  }
  params.set("scene", "content");
  params.set("id", scene.contentId);
  params.set("snap", scene.snap);
  return params;
}

export function encodeCampusMapUrl(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
) {
  return encodePersistableCampusMapUrl(
    normalizePersistentSession(session, catalog),
  );
}

export function encodeCampusMapFacilityHref(facilityId: string) {
  const session: PersistableCampusMapSession = isCanonicalCampusMapId(
    facilityId,
  )
    ? {
        mode: "browse",
        scene: { kind: "facility", facilityId, snap: "peek" },
      }
    : { mode: "browse", scene: { kind: "map" } };
  return `/campus-map?${encodePersistableCampusMapUrl(session).toString()}`;
}

export function decodeCampusMapUrl(
  input: URLSearchParams | string,
  catalog: CampusMapSceneCatalog,
): CampusMapDecodeResult {
  const params = paramsFrom(input);
  if (hasRepeatedUrlKeys(params)) return fallback("conflicting-fields");
  if (params.get("v") !== String(CAMPUS_MAP_SCENE_CODEC_VERSION)) {
    return fallback("unsupported-version");
  }
  const sceneKind = params.get("scene");
  const taskKind = params.get("task");
  if (sceneKind && taskKind) return fallback("conflicting-fields");
  if (!sceneKind && !taskKind) {
    return hasOnlyUrlKeys(params, ["v"])
      ? { status: "decoded", session: EMPTY_CAMPUS_MAP_SCENE_SESSION }
      : fallback("conflicting-fields");
  }

  if (taskKind) {
    if (!hasOnlyUrlKeys(params, ["v", "task", "anchor", "id", "returnNote"])) {
      return fallback("conflicting-fields");
    }
    if (taskKind === "edit") {
      if (!hasOnlyUrlKeys(params, ["v", "task", "id", "returnNote"])) {
        return fallback("conflicting-fields");
      }
      const placeId = params.get("id");
      if (!isCanonicalCampusMapId(placeId)) return fallback("invalid-identity");
      const returnNote = params.get("returnNote");
      if (returnNote !== null && !isCanonicalCampusMapUuid(returnNote)) {
        return fallback("invalid-return-context");
      }
      const session: CampusMapSession = {
        mode: "task",
        task: {
          kind: "edit",
          placeId,
          ...(returnNote
            ? {
                returnContext: {
                  kind: "map-note" as const,
                  noteId: returnNote,
                },
              }
            : {}),
        },
      };
      return validSession(session, catalog)
        ? { status: "decoded", session }
        : fallback("unknown-entity");
    }
    if (taskKind !== "create") return fallback("invalid-task");
    const anchor = params.get("anchor");
    let session: CampusMapSession;
    if (anchor === "map" && !params.has("id")) {
      session = {
        mode: "task",
        task: { kind: "create", anchor: { kind: "map" } },
      };
    } else if (
      anchor === "building" &&
      isCanonicalCampusMapId(params.get("id"))
    ) {
      session = {
        mode: "task",
        task: {
          kind: "create",
          anchor: { kind: "building", buildingId: params.get("id")! },
        },
      };
    } else {
      return fallback(
        anchor === "building" ? "invalid-identity" : "invalid-task",
      );
    }
    return validSession(session, catalog)
      ? { status: "decoded", session }
      : fallback("unknown-entity");
  }

  const panelSnap = snap(params.get("snap"));
  let session: CampusMapSession;
  if (sceneKind === "search" && panelSnap) {
    if (!hasOnlyUrlKeys(params, ["v", "scene", "q", "snap"])) {
      return fallback("conflicting-fields");
    }
    const query = params.get("q")?.trim();
    if (!query) return fallback("invalid-scene");
    session = {
      mode: "browse",
      scene: { kind: "search-results", query, snap: panelSnap },
    };
  } else if (sceneKind === "category" && panelSnap) {
    if (!hasOnlyUrlKeys(params, ["v", "scene", "id", "snap"])) {
      return fallback("conflicting-fields");
    }
    const category = params.get("id");
    if (!isCanonicalCampusMapId(category)) {
      return fallback("invalid-identity");
    }
    session = {
      mode: "browse",
      scene: { kind: "category-results", category, snap: panelSnap },
    };
  } else if (sceneKind === "building" && panelSnap) {
    if (!hasOnlyUrlKeys(params, ["v", "scene", "id", "floor", "snap"])) {
      return fallback("conflicting-fields");
    }
    const buildingId = params.get("id");
    const floorId = params.get("floor");
    if (
      !isCanonicalCampusMapId(buildingId) ||
      (floorId !== null && !isCanonicalCampusMapId(floorId))
    ) {
      return fallback("invalid-identity");
    }
    session = {
      mode: "browse",
      scene: { kind: "building", buildingId, floorId, snap: panelSnap },
    };
  } else if (
    (sceneKind === "facility" || sceneKind === "content") &&
    panelSnap
  ) {
    if (!hasOnlyUrlKeys(params, ["v", "scene", "id", "snap"])) {
      return fallback("conflicting-fields");
    }
    const id = params.get("id");
    if (!isCanonicalCampusMapId(id)) {
      return fallback("invalid-identity");
    }
    session =
      sceneKind === "facility"
        ? {
            mode: "browse",
            scene: { kind: "facility", facilityId: id, snap: panelSnap },
          }
        : {
            mode: "browse",
            scene: { kind: "content", contentId: id, snap: panelSnap },
          };
  } else {
    return fallback("invalid-scene");
  }

  return validSession(session, catalog)
    ? {
        status: "decoded",
        session: normalizePersistentSession(session, catalog),
      }
    : fallback("unknown-entity");
}
