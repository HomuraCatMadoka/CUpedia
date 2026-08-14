import {
  EMPTY_CAMPUS_MAP_SCENE_SESSION,
  type CampusMapSceneCatalog,
  type CampusMapSession,
} from "./scene-kernel";
import {
  isValidCampusMapPosition,
  resolveCampusMapSessionSemantics,
  type PersistableCampusMapSession,
} from "./scene-semantics";

export const CAMPUS_MAP_SCENE_CODEC_VERSION = 1 as const;

export type CampusMapDecodeResult =
  | { status: "decoded"; session: CampusMapSession }
  | { status: "fallback"; session: CampusMapSession; reason: string };

export type CampusMapHistoryDecodeResult =
  | { status: "decoded"; session: CampusMapSession; depth: number }
  | {
      status: "fallback";
      session: CampusMapSession;
      depth: 0;
      reason: string;
    };

export interface CampusMapHistorySnapshot {
  campusMapScene: true;
  version: typeof CAMPUS_MAP_SCENE_CODEC_VERSION;
  depth: number;
  session: CampusMapSession;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isSnap(value: unknown): value is "peek" | "full" {
  return value === "peek" || value === "full";
}

function isPosition(
  value: unknown,
): value is readonly [longitude: number, latitude: number] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [longitude, latitude] = value;
  return (
    typeof longitude === "number" &&
    typeof latitude === "number" &&
    isValidCampusMapPosition([longitude, latitude])
  );
}

type ParsedSession =
  | { status: "parsed"; session: CampusMapSession }
  | { status: "invalid"; reason: string };

function parseHistorySession(value: unknown): ParsedSession {
  if (!isRecord(value) || !hasOnlyKeys(value, ["mode", "scene", "task"])) {
    return { status: "invalid", reason: "invalid-snapshot" };
  }
  if (value.mode === "task") {
    if (!isRecord(value.task) || "scene" in value) {
      return { status: "invalid", reason: "conflicting-fields" };
    }
    const task = value.task;
    if (
      !hasOnlyKeys(task, ["kind", "anchor"]) ||
      task.kind !== "create" ||
      !isRecord(task.anchor)
    ) {
      return { status: "invalid", reason: "invalid-snapshot" };
    }
    const anchor = task.anchor;
    if (anchor.kind === "map" && hasOnlyKeys(anchor, ["kind"])) {
      return {
        status: "parsed",
        session: {
          mode: "task",
          task: { kind: "create", anchor: { kind: "map" } },
        },
      };
    }
    if (
      anchor.kind === "building" &&
      hasOnlyKeys(anchor, ["kind", "buildingId"]) &&
      typeof anchor.buildingId === "string" &&
      anchor.buildingId.trim()
    ) {
      return {
        status: "parsed",
        session: {
          mode: "task",
          task: {
            kind: "create",
            anchor: { kind: "building", buildingId: anchor.buildingId.trim() },
          },
        },
      };
    }
    return { status: "invalid", reason: "invalid-snapshot" };
  }

  if (value.mode !== "browse" || !isRecord(value.scene) || "task" in value) {
    return { status: "invalid", reason: "conflicting-fields" };
  }
  const scene = value.scene;
  if (scene.kind === "map" && hasOnlyKeys(scene, ["kind"])) {
    return { status: "parsed", session: EMPTY_CAMPUS_MAP_SCENE_SESSION };
  }
  if (
    scene.kind === "search-results" &&
    hasOnlyKeys(scene, ["kind", "query", "snap"]) &&
    typeof scene.query === "string" &&
    scene.query.trim() &&
    isSnap(scene.snap)
  ) {
    return {
      status: "parsed",
      session: {
        mode: "browse",
        scene: {
          kind: "search-results",
          query: scene.query.trim(),
          snap: scene.snap,
        },
      },
    };
  }
  if (
    scene.kind === "category-results" &&
    hasOnlyKeys(scene, ["kind", "category", "snap"]) &&
    typeof scene.category === "string" &&
    scene.category.trim() &&
    isSnap(scene.snap)
  ) {
    return {
      status: "parsed",
      session: {
        mode: "browse",
        scene: {
          kind: "category-results",
          category: scene.category.trim(),
          snap: scene.snap,
        },
      },
    };
  }
  if (
    scene.kind === "building" &&
    hasOnlyKeys(scene, ["kind", "buildingId", "floorId", "snap"]) &&
    typeof scene.buildingId === "string" &&
    scene.buildingId.trim() &&
    (scene.floorId === null || typeof scene.floorId === "string") &&
    isSnap(scene.snap)
  ) {
    return {
      status: "parsed",
      session: {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: scene.buildingId.trim(),
          floorId:
            typeof scene.floorId === "string"
              ? scene.floorId.trim() || null
              : null,
          snap: scene.snap,
        },
      },
    };
  }
  if (scene.kind === "facility" || scene.kind === "content") {
    if ("buildingId" in scene || "floorId" in scene || "category" in scene) {
      return { status: "invalid", reason: "conflicting-fields" };
    }
    const idKey = scene.kind === "facility" ? "facilityId" : "contentId";
    const entityId = scene[idKey];
    if (
      !hasOnlyKeys(scene, ["kind", idKey, "snap"]) ||
      typeof entityId !== "string" ||
      !entityId.trim() ||
      !isSnap(scene.snap)
    ) {
      return { status: "invalid", reason: "invalid-snapshot" };
    }
    return {
      status: "parsed",
      session:
        scene.kind === "facility"
          ? {
              mode: "browse",
              scene: {
                kind: "facility",
                facilityId: entityId.trim(),
                snap: scene.snap,
              },
            }
          : {
              mode: "browse",
              scene: {
                kind: "content",
                contentId: entityId.trim(),
                snap: scene.snap,
              },
            },
    };
  }
  if (
    scene.kind === "provider-poi" &&
    hasOnlyKeys(scene, [
      "kind",
      "provider",
      "providerPoiId",
      "name",
      "position",
    ]) &&
    scene.provider === "amap" &&
    typeof scene.providerPoiId === "string" &&
    scene.providerPoiId.trim() &&
    typeof scene.name === "string" &&
    scene.name.trim() &&
    isPosition(scene.position)
  ) {
    return {
      status: "parsed",
      session: {
        mode: "browse",
        scene: {
          kind: "provider-poi",
          provider: "amap",
          providerPoiId: scene.providerPoiId.trim(),
          name: scene.name.trim(),
          position: scene.position,
        },
      },
    };
  }
  return { status: "invalid", reason: "invalid-snapshot" };
}

function normalizePersistentSession(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
): PersistableCampusMapSession {
  const resolved = resolveCampusMapSessionSemantics(session, catalog);
  return resolved.status === "valid" &&
    resolved.persistence.kind === "persistent"
    ? resolved.persistence.session
    : { mode: "browse", scene: { kind: "map" } };
}

export function normalizeCampusMapUrlSession(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
): CampusMapSession {
  return normalizePersistentSession(session, catalog);
}

export function normalizeCampusMapHistorySession(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
): CampusMapSession {
  return normalizePersistentSession(session, catalog);
}

export function encodeCampusMapHistorySnapshot(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
  depth: number,
): CampusMapHistorySnapshot {
  return {
    campusMapScene: true,
    version: CAMPUS_MAP_SCENE_CODEC_VERSION,
    depth: Number.isInteger(depth) && depth >= 0 ? depth : 0,
    session: normalizeCampusMapHistorySession(session, catalog),
  };
}

export function decodeCampusMapHistorySnapshot(
  value: unknown,
  catalog: CampusMapSceneCatalog,
): CampusMapHistoryDecodeResult {
  const historyFallback = (reason: string): CampusMapHistoryDecodeResult => ({
    status: "fallback",
    session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
    depth: 0,
    reason,
  });
  if (!isRecord(value) || value.campusMapScene !== true) {
    return historyFallback("invalid-snapshot");
  }
  if (value.version !== CAMPUS_MAP_SCENE_CODEC_VERSION) {
    return historyFallback("unsupported-version");
  }
  if (
    !hasOnlyKeys(value, ["campusMapScene", "version", "depth", "session"]) ||
    !Number.isInteger(value.depth) ||
    (value.depth as number) < 0
  ) {
    return historyFallback("invalid-snapshot");
  }
  const parsed = parseHistorySession(value.session);
  if (parsed.status === "invalid") return historyFallback(parsed.reason);
  if (!validSession(parsed.session, catalog)) {
    return historyFallback("unknown-entity");
  }
  return {
    status: "decoded",
    session: normalizeCampusMapHistorySession(parsed.session, catalog),
    depth: value.depth as number,
  };
}

export function encodeCampusMapUrl(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
) {
  const normalized = normalizePersistentSession(session, catalog);
  const params = new URLSearchParams({
    v: String(CAMPUS_MAP_SCENE_CODEC_VERSION),
  });

  if (normalized.mode === "task") {
    params.set("task", "create");
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
    if (!hasOnlyUrlKeys(params, ["v", "task", "anchor", "id"])) {
      return fallback("conflicting-fields");
    }
    if (taskKind !== "create") return fallback("invalid-task");
    const anchor = params.get("anchor");
    let session: CampusMapSession;
    if (anchor === "map" && !params.has("id")) {
      session = {
        mode: "task",
        task: { kind: "create", anchor: { kind: "map" } },
      };
    } else if (anchor === "building" && params.get("id")?.trim()) {
      session = {
        mode: "task",
        task: {
          kind: "create",
          anchor: { kind: "building", buildingId: params.get("id")!.trim() },
        },
      };
    } else {
      return fallback("invalid-task");
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
    const category = params.get("id")?.trim();
    if (!category) return fallback("invalid-scene");
    session = {
      mode: "browse",
      scene: { kind: "category-results", category, snap: panelSnap },
    };
  } else if (sceneKind === "building" && panelSnap) {
    if (!hasOnlyUrlKeys(params, ["v", "scene", "id", "floor", "snap"])) {
      return fallback("conflicting-fields");
    }
    const buildingId = params.get("id")?.trim();
    const floorId = params.get("floor")?.trim() || null;
    if (!buildingId) return fallback("invalid-scene");
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
    const id = params.get("id")?.trim();
    if (!id) return fallback("invalid-scene");
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
    ? { status: "decoded", session }
    : fallback("unknown-entity");
}
