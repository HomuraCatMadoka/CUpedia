import "server-only";

import { tryWithDatabaseAdvisoryLock } from "@/db";
import {
  resolveCampusMapActivePlaceBySourceHistory,
  type CampusMapPlaceBySourceHistoryResult,
} from "@/lib/campus-map/fact-store";
import { publishCampusMapChangeset } from "@/lib/campus-map/publish";
import type {
  CampusMapPublishContext,
  CampusMapPublishResult,
} from "@/lib/campus-map/publish-contract";
import {
  buildCampusMapRepresentativeFacilityCommand,
  campusMapRepresentativeFacilityIdentitySource,
  getCampusMapRepresentativeFacilityManifest,
  type CampusMapRepresentativeFacilityManifestEntry,
  type RepresentativeFacilityKey,
} from "@/lib/campus-map/representative-facility-manifest";

interface RepresentativeFacilityBinding {
  key: RepresentativeFacilityKey;
  placeId: string;
  sourceRef: string;
}

export type CampusMapRepresentativeFacilityImportResult =
  | {
      status: "imported";
      outcome: "published" | "already-present";
      changesetId: string | null;
      bindings: RepresentativeFacilityBinding[];
    }
  | {
      status: "conflict";
      code:
        | "manifest-source-ambiguous"
        | "manifest-source-inactive"
        | "manifest-partially-present"
        | "manifest-source-missing-after-publish";
      key: RepresentativeFacilityKey;
      changesetId: string | null;
    }
  | {
      status: "rejected";
      result: CampusMapPublishResult;
    }
  | {
      status: "temporarily-unavailable";
      code:
        | "manifest-import-in-progress"
        | "manifest-import-unavailable"
        | "publish-unavailable";
      retryable: true;
    };

interface SourceInspection {
  entry: CampusMapRepresentativeFacilityManifestEntry;
  sourceRef: string;
  target: CampusMapPlaceBySourceHistoryResult;
}

async function inspectEntry(
  entry: CampusMapRepresentativeFacilityManifestEntry,
): Promise<SourceInspection> {
  const source = campusMapRepresentativeFacilityIdentitySource(entry);
  return {
    entry,
    sourceRef: source.ref,
    target: await resolveCampusMapActivePlaceBySourceHistory({
      kind: source.kind,
      ref: source.ref,
    }),
  };
}

function conflictForInspection(
  inspection: SourceInspection,
  changesetId: string | null,
): CampusMapRepresentativeFacilityImportResult | null {
  if (inspection.target.status === "ambiguous") {
    return {
      status: "conflict",
      code: "manifest-source-ambiguous",
      key: inspection.entry.key,
      changesetId,
    };
  }
  if (inspection.target.status === "inactive") {
    return {
      status: "conflict",
      code: "manifest-source-inactive",
      key: inspection.entry.key,
      changesetId,
    };
  }
  return null;
}

function bindingsForFoundInspections(
  inspections: readonly SourceInspection[],
): RepresentativeFacilityBinding[] {
  return inspections.map((inspection) => {
    if (inspection.target.status !== "found") {
      throw new Error("Representative facility source was not resolved");
    }
    return {
      key: inspection.entry.key,
      placeId: inspection.target.placeId,
      sourceRef: inspection.sourceRef,
    };
  });
}

async function importCampusMapRepresentativeFacilitiesWhileLocked(
  context: CampusMapPublishContext,
): Promise<CampusMapRepresentativeFacilityImportResult> {
  const manifest = getCampusMapRepresentativeFacilityManifest();
  let inspections = await Promise.all(manifest.entries.map(inspectEntry));

  for (const inspection of inspections) {
    const conflict = conflictForInspection(inspection, null);
    if (conflict) return conflict;
  }

  const presentCount = inspections.filter(
    (inspection) => inspection.target.status === "found",
  ).length;
  if (presentCount === inspections.length) {
    return {
      status: "imported",
      outcome: "already-present",
      changesetId: null,
      bindings: bindingsForFoundInspections(inspections),
    };
  }
  if (presentCount > 0) {
    const missing = inspections.find(
      (inspection) => inspection.target.status === "missing",
    )!;
    return {
      status: "conflict",
      code: "manifest-partially-present",
      key: missing.entry.key,
      changesetId: null,
    };
  }

  const published = await publishCampusMapChangeset(
    buildCampusMapRepresentativeFacilityCommand(),
    context,
  );
  if (published.status === "temporarily-unavailable") {
    return {
      status: "temporarily-unavailable",
      code: "publish-unavailable",
      retryable: true,
    };
  }
  if (published.status !== "published") {
    return { status: "rejected", result: published };
  }

  inspections = await Promise.all(manifest.entries.map(inspectEntry));
  for (const inspection of inspections) {
    const conflict = conflictForInspection(inspection, published.changesetId);
    if (conflict) return conflict;
    if (inspection.target.status === "missing") {
      return {
        status: "conflict",
        code: "manifest-source-missing-after-publish",
        key: inspection.entry.key,
        changesetId: published.changesetId,
      };
    }
  }

  return {
    status: "imported",
    outcome: "published",
    changesetId: published.changesetId,
    bindings: bindingsForFoundInspections(inspections),
  };
}

/** One-time admin import. The official source references make retries safe. */
export async function importCampusMapRepresentativeFacilities(
  context: CampusMapPublishContext,
): Promise<CampusMapRepresentativeFacilityImportResult> {
  const manifest = getCampusMapRepresentativeFacilityManifest();
  try {
    const attempt = await tryWithDatabaseAdvisoryLock(
      `campus-map-representative-facilities:${manifest.version}`,
      () => importCampusMapRepresentativeFacilitiesWhileLocked(context),
    );
    return attempt.acquired
      ? attempt.value
      : {
          status: "temporarily-unavailable",
          code: "manifest-import-in-progress",
          retryable: true,
        };
  } catch {
    return {
      status: "temporarily-unavailable",
      code: "manifest-import-unavailable",
      retryable: true,
    };
  }
}
