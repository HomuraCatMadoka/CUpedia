import type {
  CampusMapBrowseScene,
  CampusMapContributionTask,
  CampusMapFocusCommand,
  CampusMapSceneCatalog,
  CampusMapSession,
} from "./scene-kernel";

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
        buildingId: string;
        floorId: string;
        category: string;
      } | null;
      buildingId: string | null;
      focus: CampusMapFocusCommand;
      contributionAnchor: CampusMapContributionTask["anchor"];
      persistence: CampusMapPersistenceProjection;
    };

function persistentBrowse(
  scene: Exclude<CampusMapBrowseScene, { kind: "provider-poi" }>,
): CampusMapPersistenceProjection {
  return { kind: "persistent", session: { mode: "browse", scene } };
}

type CatalogBuilding = NonNullable<CampusMapSceneCatalog["buildings"][string]>;
type CatalogFacility = NonNullable<CampusMapSceneCatalog["facilities"][string]>;
type CatalogRelation = Pick<
  CatalogFacility,
  "buildingId" | "floorId" | "category"
>;

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
  return decodeCatalogRelation(value);
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
    const anchor = session.task.anchor;
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
      focus: { kind: "map" },
      contributionAnchor: { kind: "map" },
      persistence: persistentBrowse(scene),
    };
  }
  if (scene.kind === "search-results") {
    if (
      scene.query !== scene.query.trimStart() ||
      scene.query.trim().length === 0
    ) {
      return { status: "invalid", reason: "invalid-query" };
    }
    return {
      status: "valid",
      session,
      context: null,
      buildingId: null,
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
      focus: { kind: "map" },
      contributionAnchor: { kind: "map" },
      persistence: { kind: "transient" },
    };
  }

  const entity =
    scene.kind === "facility"
      ? findFacility(catalog, scene.facilityId)
      : findContent(catalog, scene.contentId);
  if (
    !entity ||
    !findBuilding(catalog, entity.buildingId)?.floorIds.includes(
      entity.floorId,
    ) ||
    !hasCategory(catalog, entity.category)
  ) {
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
    focus: { kind: "heading" },
    contributionAnchor: { kind: "building", buildingId: entity.buildingId },
    persistence: persistentBrowse(scene),
  };
}
