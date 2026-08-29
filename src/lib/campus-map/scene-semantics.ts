import type {
  CampusMapBrowseScene,
  CampusMapCameraCommand,
  CampusMapContributionTask,
  CampusMapFocusCommand,
  CampusMapFocusTarget,
  CampusMapSceneCatalog,
  CampusMapSession,
} from "./scene-kernel";
import type { CameraReason } from "./camera-policy";
import { isCanonicalCampusMapUuid } from "./canonical-uuid";

export type PersistableCampusMapSession =
  | {
      mode: "browse";
      scene: Exclude<CampusMapBrowseScene, { kind: "provider-poi" }>;
    }
  | Extract<CampusMapSession, { mode: "task" }>;

type CampusMapPersistenceProjection =
  | { kind: "persistent"; session: PersistableCampusMapSession }
  | { kind: "transient" };

export type CampusMapSessionSemantics =
  | { status: "invalid"; reason: string }
  | {
      status: "valid";
      session: CampusMapSession;
      context: {
        buildingId: string | null;
        floorId: string | null;
        category: string;
      } | null;
      buildingId: string | null;
      cameraTarget: CampusMapSceneCameraTarget;
      focus: CampusMapFocusTarget;
      contributionAnchor: Extract<
        CampusMapContributionTask,
        { kind: "create" }
      >["anchor"];
      persistence: CampusMapPersistenceProjection;
    };

export type CampusMapSceneCameraTarget =
  | { kind: "building"; buildingId: string }
  | { kind: "place"; placeId: string }
  | null;

type ValidCampusMapSessionSemantics = Extract<
  CampusMapSessionSemantics,
  { status: "valid" }
>;

export function projectCampusMapSceneCameraCommand(
  target: CampusMapSceneCameraTarget,
  reason: CameraReason,
): Exclude<CampusMapCameraCommand, { kind: "cancel" }> | null {
  if (!target) return null;
  return target.kind === "building"
    ? { kind: "focus", buildingId: target.buildingId, reason }
    : { kind: "focus-place", placeId: target.placeId, reason };
}

function persistentBrowse(
  scene: Exclude<CampusMapBrowseScene, { kind: "provider-poi" }>,
): CampusMapPersistenceProjection {
  return { kind: "persistent", session: { mode: "browse", scene } };
}

type CatalogBuilding = NonNullable<CampusMapSceneCatalog["buildings"][string]>;
type CatalogRelation = {
  buildingId: string;
  floorId: string;
  category: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isCanonicalCampusMapId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value === value.trim()
  );
}

function hasCategory(catalog: CampusMapSceneCatalog, category: string) {
  return (
    isCanonicalCampusMapId(category) &&
    catalog.categories.some(
      (candidate) =>
        isCanonicalCampusMapId(candidate) && candidate === category,
    )
  );
}

function ownCatalogValue(
  entities: Readonly<Record<string, unknown>>,
  id: string,
): unknown {
  return isCanonicalCampusMapId(id) && Object.hasOwn(entities, id)
    ? entities[id]
    : undefined;
}

function findBuilding(
  catalog: CampusMapSceneCatalog,
  buildingId: string,
): CatalogBuilding | undefined {
  const value = ownCatalogValue(catalog.buildings, buildingId);
  if (!isRecord(value)) return undefined;
  const floorIds = value.floorIds;
  return Array.isArray(floorIds) && floorIds.every(isCanonicalCampusMapId)
    ? { floorIds: [...floorIds] }
    : undefined;
}

function decodeCatalogRelation(value: unknown): CatalogRelation | undefined {
  if (!isRecord(value)) return undefined;
  const { buildingId, floorId, category } = value;
  return isCanonicalCampusMapId(buildingId) &&
    isCanonicalCampusMapId(floorId) &&
    isCanonicalCampusMapId(category)
    ? { buildingId, floorId, category }
    : undefined;
}

function findFacility(catalog: CampusMapSceneCatalog, facilityId: string) {
  const value = ownCatalogValue(catalog.facilities, facilityId);
  if (!isRecord(value)) return undefined;
  const { buildingId, floorId, category, cameraTarget } = value;
  if (
    (buildingId !== null && !isCanonicalCampusMapId(buildingId)) ||
    (floorId !== null && !isCanonicalCampusMapId(floorId)) ||
    !isCanonicalCampusMapId(category) ||
    (floorId !== null && buildingId === null) ||
    (cameraTarget !== undefined &&
      cameraTarget !== null &&
      cameraTarget !== "building-anchor" &&
      cameraTarget !== "place-point")
  ) {
    return undefined;
  }
  const normalizedCameraTarget =
    cameraTarget === undefined && buildingId ? "building-anchor" : cameraTarget;
  if (
    (normalizedCameraTarget === "building-anchor" && buildingId === null) ||
    (normalizedCameraTarget === "place-point" && buildingId !== null)
  ) {
    return undefined;
  }
  return {
    buildingId,
    floorId,
    category,
    cameraTarget: normalizedCameraTarget ?? null,
  };
}

export function projectCampusMapReturnFocus(
  source: CampusMapSession,
  target: ValidCampusMapSessionSemantics,
  catalog: CampusMapSceneCatalog,
): CampusMapFocusCommand {
  if (source.mode !== "browse" || target.session.mode !== "browse") {
    return target.focus;
  }

  const sourceScene = source.scene;
  const targetScene = target.session.scene;
  if (sourceScene.kind === "category-results" && targetScene.kind === "map") {
    return {
      kind: "category-filter",
      category: sourceScene.category,
      fallback: target.focus,
    };
  }
  if (
    sourceScene.kind === "building" &&
    (targetScene.kind === "search-results" ||
      targetScene.kind === "category-results" ||
      targetScene.kind === "building")
  ) {
    return {
      kind: "result",
      resultId: sourceScene.buildingId,
      fallback: target.focus,
    };
  }
  if (
    sourceScene.kind === "content" &&
    (targetScene.kind === "search-results" ||
      targetScene.kind === "category-results" ||
      targetScene.kind === "building")
  ) {
    return {
      kind: "result",
      resultId: sourceScene.contentId,
      fallback: target.focus,
    };
  }
  if (sourceScene.kind !== "facility") return target.focus;

  const facility = findFacility(catalog, sourceScene.facilityId);
  const restoresTrigger =
    targetScene.kind === "search-results" ||
    (targetScene.kind === "building" &&
      facility?.buildingId === targetScene.buildingId) ||
    (targetScene.kind === "category-results" &&
      facility?.category === targetScene.category);

  return restoresTrigger
    ? {
        kind: "result",
        resultId: sourceScene.facilityId,
        fallback: target.focus,
      }
    : target.focus;
}

function findContent(catalog: CampusMapSceneCatalog, contentId: string) {
  const value = ownCatalogValue(catalog.contents, contentId);
  const relation = decodeCatalogRelation(value);
  if (!relation || !isRecord(value)) return undefined;
  const { kind } = value;
  return typeof kind === "string" ? { ...relation, kind } : undefined;
}

export function isValidCampusMapPosition(position: readonly [number, number]) {
  return (
    Number.isFinite(position[0]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    Number.isFinite(position[1]) &&
    position[1] >= -90 &&
    position[1] <= 90
  );
}

export function resolveCampusMapSessionSemantics(
  session: CampusMapSession,
  catalog: CampusMapSceneCatalog,
): CampusMapSessionSemantics {
  if (session.mode === "task") {
    if (
      session.task.kind === "edit" &&
      session.task.returnContext !== undefined &&
      (session.task.returnContext.kind !== "map-note" ||
        !isCanonicalCampusMapUuid(session.task.returnContext.noteId))
    ) {
      return { status: "invalid", reason: "invalid-return-context" };
    }
    const editedPlace =
      session.task.kind === "edit"
        ? findFacility(catalog, session.task.placeId)
        : null;
    if (session.task.kind === "edit" && !editedPlace) {
      return { status: "invalid", reason: "unknown-facility" };
    }
    const anchor =
      session.task.kind === "create"
        ? session.task.anchor
        : editedPlace!.buildingId
          ? {
              kind: "building" as const,
              buildingId: editedPlace!.buildingId,
            }
          : { kind: "map" as const };
    if (
      anchor.kind === "building" &&
      !findBuilding(catalog, anchor.buildingId)
    ) {
      return { status: "invalid", reason: "unknown-building" };
    }
    return {
      status: "valid",
      session,
      context: null,
      buildingId: anchor.kind === "building" ? anchor.buildingId : null,
      cameraTarget:
        anchor.kind === "building"
          ? { kind: "building", buildingId: anchor.buildingId }
          : null,
      focus: { kind: "contribution-form" },
      contributionAnchor: anchor,
      persistence: { kind: "persistent", session },
    };
  }

  const scene = session.scene;
  if (scene.kind === "map") {
    return {
      status: "valid",
      session,
      context: null,
      buildingId: null,
      cameraTarget: null,
      focus: { kind: "map" },
      contributionAnchor: { kind: "map" },
      persistence: persistentBrowse(scene),
    };
  }
  if (scene.kind === "search-results") {
    if (scene.query !== scene.query.trim() || scene.query.length === 0) {
      return { status: "invalid", reason: "invalid-query" };
    }
    return {
      status: "valid",
      session,
      context: null,
      buildingId: null,
      cameraTarget: null,
      focus: { kind: "search-input" },
      contributionAnchor: { kind: "map" },
      persistence: persistentBrowse(scene),
    };
  }
  if (scene.kind === "category-results") {
    if (!hasCategory(catalog, scene.category)) {
      return { status: "invalid", reason: "unknown-category" };
    }
    return {
      status: "valid",
      session,
      context: null,
      buildingId: null,
      cameraTarget: null,
      focus: { kind: "results" },
      contributionAnchor: { kind: "map" },
      persistence: persistentBrowse(scene),
    };
  }
  if (scene.kind === "building") {
    const building = findBuilding(catalog, scene.buildingId);
    if (
      !building ||
      (scene.floorId !== null && !building.floorIds.includes(scene.floorId))
    ) {
      return { status: "invalid", reason: "unknown-building" };
    }
    return {
      status: "valid",
      session,
      context: null,
      buildingId: scene.buildingId,
      cameraTarget: { kind: "building", buildingId: scene.buildingId },
      focus: { kind: "heading" },
      contributionAnchor: { kind: "building", buildingId: scene.buildingId },
      persistence: persistentBrowse(scene),
    };
  }
  if (scene.kind === "provider-poi") {
    if (
      !isCanonicalCampusMapId(scene.providerPoiId) ||
      scene.name !== scene.name.trim() ||
      scene.name.length === 0 ||
      !isValidCampusMapPosition(scene.position)
    ) {
      return { status: "invalid", reason: "invalid-provider-poi" };
    }
    return {
      status: "valid",
      session,
      context: null,
      buildingId: null,
      cameraTarget: null,
      focus: { kind: "map" },
      contributionAnchor: { kind: "map" },
      persistence: { kind: "transient" },
    };
  }

  const entity =
    scene.kind === "facility"
      ? findFacility(catalog, scene.facilityId)
      : findContent(catalog, scene.contentId);
  const building = entity?.buildingId
    ? findBuilding(catalog, entity.buildingId)
    : undefined;
  const validRelationship =
    scene.kind === "facility"
      ? Boolean(
          entity &&
          (entity.buildingId === null ||
            (building &&
              (entity.floorId === null ||
                building.floorIds.includes(entity.floorId)))),
        )
      : Boolean(
          entity && building?.floorIds.includes(entity.floorId as string),
        );
  if (!entity || !validRelationship || !hasCategory(catalog, entity.category)) {
    return {
      status: "invalid",
      reason:
        scene.kind === "facility" ? "unknown-facility" : "unknown-content",
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
    buildingId: entity.buildingId,
    cameraTarget:
      scene.kind === "facility" && "cameraTarget" in entity
        ? entity.cameraTarget === "place-point"
          ? { kind: "place", placeId: scene.facilityId }
          : entity.cameraTarget === "building-anchor" && entity.buildingId
            ? { kind: "building", buildingId: entity.buildingId }
            : null
        : entity.buildingId
          ? { kind: "building", buildingId: entity.buildingId }
          : null,
    focus: { kind: "heading" },
    contributionAnchor: entity.buildingId
      ? { kind: "building", buildingId: entity.buildingId }
      : { kind: "map" },
    persistence: persistentBrowse(
      scene.kind === "facility" ? { ...scene, snap: "peek" } : scene,
    ),
  };
}
