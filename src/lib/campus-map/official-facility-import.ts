import { tryWithDatabaseAdvisoryLock } from "@/db";
import {
  getCampusMapCurrentPlace,
  listCampusMapBrowseBuildings,
  resolveCampusMapActivePlaceBySourceHistory,
  type CampusMapBrowseBuildingRecord,
  type CampusMapCurrentPlace,
  type CampusMapPlaceBySourceHistoryResult,
} from "@/lib/campus-map/fact-store";
import {
  buildCampusMapOfficialFacilityChunkCommand,
  canonicalCampusMapOfficialFacilityJson,
  chunkCampusMapOfficialFacilityManifest,
  parseCampusMapOfficialFacilityManifest,
  type CampusMapOfficialFacilityBatch,
  type CampusMapOfficialFacilityManifest,
  type CampusMapOfficialFacilityManifestEntry,
} from "@/lib/campus-map/official-facility-manifest";
import { publishCampusMapChangeset } from "@/lib/campus-map/publish";
import type {
  CampusMapPublishContext,
  CampusMapPublishFactInput,
  CampusMapPublishResult,
} from "@/lib/campus-map/publish-contract";
import { getCampusMapRepresentativeFacilityManifest } from "@/lib/campus-map/representative-facility-manifest";

export interface CampusMapOfficialFacilityBinding {
  key: string;
  sourceRef: string;
  placeId: string;
}

export interface CampusMapOfficialFacilityProgressRecord {
  manifestHash: string;
  batch: CampusMapOfficialFacilityBatch;
  chunkKey: string;
  status: "already-present" | "published";
  changesetId: string | null;
  completedAt: string;
  bindings: CampusMapOfficialFacilityBinding[];
}

export interface CampusMapOfficialFacilityImportOptions {
  batch: CampusMapOfficialFacilityBatch;
  onProgress?: (
    record: CampusMapOfficialFacilityProgressRecord,
  ) => void | Promise<void>;
}

export interface CampusMapOfficialFacilityFactDifference {
  field: keyof CampusMapPublishFactInput;
  current: unknown;
  approved: unknown;
}

export type CampusMapOfficialFacilityImportResult =
  | {
      status: "imported";
      outcome: "published" | "already-present";
      batch: CampusMapOfficialFacilityBatch;
      publishedChunks: number;
      existingChunks: number;
      bindings: CampusMapOfficialFacilityBinding[];
    }
  | { status: "invalid-manifest"; errors: string[] }
  | {
      status: "conflict";
      code:
        | "canonical-building-missing"
        | "canonical-floor-missing"
        | "manifest-source-ambiguous"
        | "manifest-source-inactive"
        | "manifest-existing-fact-differs"
        | "manifest-source-missing-after-publish"
        | "canary-not-complete";
      key: string;
      chunkKey: string | null;
      changesetId: string | null;
      differences?: CampusMapOfficialFacilityFactDifference[];
    }
  | {
      status: "rejected";
      chunkKey: string;
      result: CampusMapPublishResult;
    }
  | {
      status: "temporarily-unavailable";
      code:
        | "manifest-import-in-progress"
        | "manifest-import-unavailable"
        | "publish-unavailable"
        | "publish-rate-limited";
      retryable: true;
      chunkKey: string | null;
      retryAfter?: number;
    };

export interface CampusMapOfficialFacilityImportPorts {
  listBuildings: () => Promise<CampusMapBrowseBuildingRecord[]>;
  resolveSource: (input: {
    kind: "official";
    ref: string;
  }) => Promise<CampusMapPlaceBySourceHistoryResult>;
  readCurrent: (placeId: string) => Promise<{
    revisionId: string;
    fact: CampusMapPublishFactInput;
  } | null>;
  publish: (
    command: Parameters<typeof publishCampusMapChangeset>[0],
    context: CampusMapPublishContext,
  ) => Promise<CampusMapPublishResult>;
  now: () => Date;
}

const runtimePorts: CampusMapOfficialFacilityImportPorts = {
  listBuildings: listCampusMapBrowseBuildings,
  resolveSource: resolveCampusMapActivePlaceBySourceHistory,
  readCurrent: async (placeId) => {
    const place = await getCampusMapCurrentPlace(placeId);
    return place
      ? { revisionId: place.revisionId, fact: currentPlaceFact(place) }
      : null;
  },
  publish: publishCampusMapChangeset,
  now: () => new Date(),
};

/** Returns the cross-process identity used to serialize a manifest import. */
export function campusMapOfficialFacilityLockKey(
  manifest: Pick<
    CampusMapOfficialFacilityManifest,
    "schemaVersion" | "manifestVersion"
  >,
): string {
  return `campus-map-official-facilities:${manifest.schemaVersion}:${manifest.manifestVersion}`;
}

interface SourceInspection {
  entry: CampusMapOfficialFacilityManifestEntry;
  target: CampusMapPlaceBySourceHistoryResult;
  current: {
    revisionId: string;
    fact: CampusMapPublishFactInput;
  } | null;
}

const representativeFactsBySourceRef = new Map(
  getCampusMapRepresentativeFacilityManifest().entries.map((entry) => [
    entry.change.sources[0]!.ref,
    entry.change.fact,
  ]),
);

function currentPlaceFact(
  place: CampusMapCurrentPlace,
): CampusMapPublishFactInput {
  let location: CampusMapPublishFactInput["location"];
  if (place.location.kind === "building") {
    location = { kind: "building" };
  } else if (place.location.kind === "floor") {
    location = { kind: "floor" };
  } else {
    location = {
      kind: "outdoor-point",
      longitude: place.location.point.longitude,
      latitude: place.location.point.latitude,
      crs: place.location.point.crs,
      precision: place.location.point.precision,
    };
  }
  return {
    name: place.name,
    buildingId:
      place.location.kind === "outdoor-point"
        ? null
        : place.location.building.id,
    floorId: place.location.kind === "floor" ? place.location.floor.id : null,
    placeType: place.placeType,
    regularHours: place.regularHours,
    officialActions: place.officialActions,
    visitNote: place.visitNote,
    capabilities: place.capabilities,
    gender: place.gender,
    wheelchairAccess: place.wheelchairAccess,
    location,
    observedAt: place.observedAt?.toISOString() ?? null,
  };
}

const factFields: ReadonlyArray<keyof CampusMapPublishFactInput> = [
  "name",
  "buildingId",
  "floorId",
  "placeType",
  "regularHours",
  "officialActions",
  "visitNote",
  "capabilities",
  "gender",
  "wheelchairAccess",
  "location",
  "observedAt",
];

function factDifferences(
  current: CampusMapPublishFactInput,
  approved: CampusMapPublishFactInput,
): CampusMapOfficialFacilityFactDifference[] {
  return factFields.flatMap((field) =>
    canonicalCampusMapOfficialFacilityJson(current[field]) ===
    canonicalCampusMapOfficialFacilityJson(approved[field])
      ? []
      : [{ field, current: current[field], approved: approved[field] }],
  );
}

function canonicalTargetConflict(
  manifest: CampusMapOfficialFacilityManifest,
  buildings: readonly CampusMapBrowseBuildingRecord[],
): Extract<
  CampusMapOfficialFacilityImportResult,
  { status: "conflict" }
> | null {
  const buildingsById = new Map(
    buildings.map((building) => [building.buildingId, building]),
  );
  for (const mapping of manifest.buildingMappings) {
    if (!buildingsById.has(mapping.canonicalBuildingId)) {
      return {
        status: "conflict",
        code: "canonical-building-missing",
        key: `${mapping.sourceGroup}:${mapping.sourceLabel}`,
        chunkKey: null,
        changesetId: null,
      };
    }
  }
  for (const entry of manifest.entries) {
    if (entry.decision.status !== "publish") continue;
    const buildingId = entry.decision.buildingId;
    if (buildingId === null) continue;
    const building = buildingsById.get(buildingId);
    if (!building) {
      return {
        status: "conflict",
        code: "canonical-building-missing",
        key: entry.key,
        chunkKey: null,
        changesetId: null,
      };
    }
    const floorId = entry.decision.floorId;
    if (
      floorId !== null &&
      !building.floors.some((floor) => floor.floorId === floorId)
    ) {
      return {
        status: "conflict",
        code: "canonical-floor-missing",
        key: entry.key,
        chunkKey: null,
        changesetId: null,
      };
    }
  }
  return null;
}

async function inspectPublishEntries(
  entries: readonly CampusMapOfficialFacilityManifestEntry[],
  ports: CampusMapOfficialFacilityImportPorts,
): Promise<Map<string, SourceInspection>> {
  const inspections = new Map<string, SourceInspection>();
  // Keep this sequential: each lookup uses the shared database pool and this is a
  // one-time operator command, not a latency-sensitive request path.
  for (const entry of entries) {
    if (entry.decision.status !== "publish") continue;
    inspections.set(entry.key, {
      entry,
      target: await ports.resolveSource({
        kind: "official",
        ref: entry.sourceRef,
      }),
      current: null,
    });
    const inspection = inspections.get(entry.key)!;
    if (inspection.target.status === "found") {
      inspection.current = await ports.readCurrent(inspection.target.placeId);
    }
  }
  return inspections;
}

function inspectionConflict(
  inspection: SourceInspection,
  chunkKey: string | null,
  changesetId: string | null,
): Extract<
  CampusMapOfficialFacilityImportResult,
  { status: "conflict" }
> | null {
  if (
    inspection.target.status !== "ambiguous" &&
    inspection.target.status !== "inactive"
  ) {
    if (inspection.target.status !== "found") return null;
    if (inspection.current === null) {
      return {
        status: "conflict",
        code: "manifest-source-inactive",
        key: inspection.entry.key,
        chunkKey,
        changesetId,
      };
    }
    const approved = inspection.entry.fact;
    if (approved === null) return null;
    const differences = factDifferences(inspection.current.fact, approved);
    const representativeFact = representativeFactsBySourceRef.get(
      inspection.entry.sourceRef,
    );
    const isReviewedRepresentativeTransition =
      representativeFact !== undefined &&
      factDifferences(inspection.current.fact, representativeFact).length === 0;
    return differences.length === 0
      ? null
      : isReviewedRepresentativeTransition
        ? null
        : {
            status: "conflict",
            code: "manifest-existing-fact-differs",
            key: inspection.entry.key,
            chunkKey,
            changesetId,
            differences,
          };
  }
  return {
    status: "conflict",
    code:
      inspection.target.status === "ambiguous"
        ? "manifest-source-ambiguous"
        : "manifest-source-inactive",
    key: inspection.entry.key,
    chunkKey,
    changesetId,
  };
}

function requiresRepresentativeTransition(
  inspection: SourceInspection,
): boolean {
  if (
    inspection.target.status !== "found" ||
    inspection.current === null ||
    inspection.entry.fact === null
  ) {
    return false;
  }
  const representativeFact = representativeFactsBySourceRef.get(
    inspection.entry.sourceRef,
  );
  return (
    representativeFact !== undefined &&
    factDifferences(inspection.current.fact, representativeFact).length === 0 &&
    factDifferences(inspection.current.fact, inspection.entry.fact).length > 0
  );
}

function bindingForInspection(
  inspection: SourceInspection,
): CampusMapOfficialFacilityBinding {
  if (inspection.target.status !== "found") {
    throw new Error(
      `Official facility source is unresolved: ${inspection.entry.key}`,
    );
  }
  return {
    key: inspection.entry.key,
    sourceRef: inspection.entry.sourceRef,
    placeId: inspection.target.placeId,
  };
}

export async function importCampusMapOfficialFacilitiesWithPorts(
  manifest: CampusMapOfficialFacilityManifest,
  context: CampusMapPublishContext,
  options: CampusMapOfficialFacilityImportOptions,
  ports: CampusMapOfficialFacilityImportPorts,
): Promise<CampusMapOfficialFacilityImportResult> {
  const buildings = await ports.listBuildings();
  const targetConflict = canonicalTargetConflict(manifest, buildings);
  if (targetConflict) return targetConflict;

  const publishEntries = manifest.entries.filter(
    (entry) => entry.decision.status === "publish",
  );
  const inspections = await inspectPublishEntries(publishEntries, ports);
  for (const inspection of inspections.values()) {
    const conflict = inspectionConflict(inspection, null, null);
    if (conflict) return conflict;
  }

  if (options.batch === "res") {
    const incompleteCanary = publishEntries.find((entry) => {
      if (entry.batch !== "canary") return false;
      const inspection = inspections.get(entry.key);
      return (
        inspection === undefined ||
        inspection.target.status !== "found" ||
        requiresRepresentativeTransition(inspection)
      );
    });
    if (incompleteCanary) {
      return {
        status: "conflict",
        code: "canary-not-complete",
        key: incompleteCanary.key,
        chunkKey: null,
        changesetId: null,
      };
    }
  }

  let publishedChunks = 0;
  let existingChunks = 0;
  const chunks = chunkCampusMapOfficialFacilityManifest(manifest).filter(
    (chunk) => chunk.batch === options.batch,
  );
  for (const chunk of chunks) {
    const entriesToPublish = chunk.entries.filter(
      (entry) => inspections.get(entry.key)?.target.status === "missing",
    );
    const transitionEntries = chunk.entries.filter((entry) => {
      const inspection = inspections.get(entry.key);
      return inspection ? requiresRepresentativeTransition(inspection) : false;
    });
    entriesToPublish.push(...transitionEntries);
    if (entriesToPublish.length === 0) {
      existingChunks += 1;
      await options.onProgress?.({
        manifestHash: manifest.manifestHash,
        batch: chunk.batch,
        chunkKey: chunk.key,
        status: "already-present",
        changesetId: null,
        completedAt: ports.now().toISOString(),
        bindings: chunk.entries.map((entry) =>
          bindingForInspection(inspections.get(entry.key)!),
        ),
      });
      continue;
    }

    const published = await ports.publish(
      buildCampusMapOfficialFacilityChunkCommand(
        manifest,
        chunk,
        entriesToPublish,
        transitionEntries.map((entry) => {
          const inspection = inspections.get(entry.key)!;
          if (
            inspection.target.status !== "found" ||
            inspection.current === null
          ) {
            throw new Error(`Missing transition target: ${entry.key}`);
          }
          return {
            sourceRef: entry.sourceRef,
            placeId: inspection.target.placeId,
            baseRevisionId: inspection.current.revisionId,
          };
        }),
      ),
      context,
    );
    if (published.status === "temporarily-unavailable") {
      return {
        status: "temporarily-unavailable",
        code: "publish-unavailable",
        retryable: true,
        chunkKey: chunk.key,
      };
    }
    if (published.status === "rate-limited") {
      return {
        status: "temporarily-unavailable",
        code: "publish-rate-limited",
        retryable: true,
        chunkKey: chunk.key,
        retryAfter: published.retryAfter,
      };
    }
    if (published.status !== "published") {
      return { status: "rejected", chunkKey: chunk.key, result: published };
    }

    for (const entry of entriesToPublish) {
      const target = await ports.resolveSource({
        kind: "official",
        ref: entry.sourceRef,
      });
      const inspection = {
        entry,
        target,
        current:
          target.status === "found"
            ? await ports.readCurrent(target.placeId)
            : null,
      };
      inspections.set(entry.key, inspection);
      const conflict = inspectionConflict(
        inspection,
        chunk.key,
        published.changesetId,
      );
      if (conflict) return conflict;
      if (target.status === "missing") {
        return {
          status: "conflict",
          code: "manifest-source-missing-after-publish",
          key: entry.key,
          chunkKey: chunk.key,
          changesetId: published.changesetId,
        };
      }
    }
    publishedChunks += 1;
    await options.onProgress?.({
      manifestHash: manifest.manifestHash,
      batch: chunk.batch,
      chunkKey: chunk.key,
      status: "published",
      changesetId: published.changesetId,
      completedAt: ports.now().toISOString(),
      bindings: chunk.entries.map((entry) =>
        bindingForInspection(inspections.get(entry.key)!),
      ),
    });
  }

  const selectedEntries = publishEntries.filter(
    (entry) => entry.batch === options.batch,
  );
  return {
    status: "imported",
    outcome: publishedChunks > 0 ? "published" : "already-present",
    batch: options.batch,
    publishedChunks,
    existingChunks,
    bindings: selectedEntries.map((entry) =>
      bindingForInspection(inspections.get(entry.key)!),
    ),
  };
}

/**
 * One-time operator import. The whole approved manifest is checked before the
 * first write; stable official source refs make reruns and crash recovery safe.
 */
export async function importCampusMapOfficialFacilities(
  value: unknown,
  context: CampusMapPublishContext,
  options: CampusMapOfficialFacilityImportOptions,
): Promise<CampusMapOfficialFacilityImportResult> {
  const parsed = parseCampusMapOfficialFacilityManifest(value, {
    requireApproval: true,
  });
  if (parsed.status === "invalid") {
    return { status: "invalid-manifest", errors: parsed.errors };
  }
  try {
    const attempt = await tryWithDatabaseAdvisoryLock(
      campusMapOfficialFacilityLockKey(parsed.manifest),
      () =>
        importCampusMapOfficialFacilitiesWithPorts(
          parsed.manifest,
          context,
          options,
          runtimePorts,
        ),
    );
    return attempt.acquired
      ? attempt.value
      : {
          status: "temporarily-unavailable",
          code: "manifest-import-in-progress",
          retryable: true,
          chunkKey: null,
        };
  } catch {
    return {
      status: "temporarily-unavailable",
      code: "manifest-import-unavailable",
      retryable: true,
      chunkKey: null,
    };
  }
}
