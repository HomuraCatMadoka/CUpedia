import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type {
  CampusMapBrowseBuildingRecord,
  CampusMapPlaceBySourceHistoryResult,
} from "@/lib/campus-map/fact-store";
import {
  campusMapOfficialFacilityLockKey,
  importCampusMapOfficialFacilitiesWithPorts,
  type CampusMapOfficialFacilityImportPorts,
  type CampusMapOfficialFacilityProgressRecord,
} from "@/lib/campus-map/official-facility-import";
import {
  approveCampusMapOfficialFacilityManifest,
  parseCampusMapOfficialFacilityManifest,
  type CampusMapOfficialFacilityManifest,
} from "@/lib/campus-map/official-facility-manifest";
import type { CampusMapPublishCommand } from "@/lib/campus-map/publish-contract";
import { getCampusMapRepresentativeFacilityManifest } from "@/lib/campus-map/representative-facility-manifest";
import { canonicalCampusMapOfficialFacilityFloorLabel } from "@/lib/campus-map/official-facility-source";

const manifestPath = new URL(
  "../../docs/campus-map/data/official-facilities-2026-09-07.json",
  import.meta.url,
);

let manifest: CampusMapOfficialFacilityManifest;

beforeAll(async () => {
  const parsed = parseCampusMapOfficialFacilityManifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  if (parsed.status === "invalid") throw new Error(parsed.errors.join(", "));
  manifest = approveCampusMapOfficialFacilityManifest(
    parsed.manifest,
    "Test reviewer",
    "2026-09-07",
  );
});

function testBuildings(): CampusMapBrowseBuildingRecord[] {
  const buildings = new Map<string, CampusMapBrowseBuildingRecord>();
  for (const mapping of manifest.buildingMappings) {
    buildings.set(mapping.canonicalBuildingId, {
      buildingId: mapping.canonicalBuildingId,
      name: mapping.canonicalBuildingName,
      englishName: mapping.canonicalBuildingName,
      code: null,
      aliases: [],
      anchor: null,
      floors: [],
    });
  }
  for (const entry of manifest.entries) {
    if (
      entry.decision.status !== "publish" ||
      entry.decision.buildingId === null ||
      entry.decision.floorId === null
    ) {
      continue;
    }
    const { buildingId, floorId } = entry.decision;
    const building = buildings.get(buildingId)!;
    if (building.floors.some((floor) => floor.floorId === floorId)) {
      continue;
    }
    const displayLabel = canonicalCampusMapOfficialFacilityFloorLabel(
      entry.extracted.sourceFloor,
    );
    if (!displayLabel) throw new Error(`Missing test Floor: ${entry.key}`);
    buildings.set(buildingId, {
      ...building,
      floors: [
        ...building.floors,
        { floorId, displayLabel, sortOrder: building.floors.length },
      ],
    });
  }
  return [...buildings.values()];
}

function testPorts(
  initiallyFound: string[] = [],
  initialFactsByRef = new Map<
    string,
    NonNullable<(typeof manifest.entries)[number]["fact"]>
  >(),
) {
  const entriesByRef = new Map(
    manifest.entries
      .filter((entry) => entry.decision.status === "publish")
      .map((entry) => [entry.sourceRef, entry]),
  );
  const facts = new Map<
    string,
    NonNullable<(typeof manifest.entries)[number]["fact"]>
  >();
  const revisions = new Map<string, string>();
  const targets = new Map<string, CampusMapPlaceBySourceHistoryResult>(
    initiallyFound.map((ref, index) => [
      ref,
      {
        status: "found",
        placeId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        provenanceId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      },
    ]),
  );
  for (const ref of initiallyFound) {
    const target = targets.get(ref);
    const fact = initialFactsByRef.get(ref) ?? entriesByRef.get(ref)?.fact;
    if (target?.status === "found" && fact) {
      facts.set(target.placeId, structuredClone(fact));
      revisions.set(
        target.placeId,
        `40000000-0000-4000-8000-${String(facts.size).padStart(12, "0")}`,
      );
    }
  }
  let placeSequence = initiallyFound.length;
  const publishedCommands: CampusMapPublishCommand[] = [];
  const ports: CampusMapOfficialFacilityImportPorts = {
    listBuildings: async () => testBuildings(),
    resolveSource: async ({ ref }) => targets.get(ref) ?? { status: "missing" },
    readCurrent: async (placeId) => {
      const fact = facts.get(placeId);
      const revisionId = revisions.get(placeId);
      return fact && revisionId
        ? { fact: structuredClone(fact), revisionId }
        : null;
    },
    publish: async (command) => {
      publishedCommands.push(command);
      const changes = command.changes.map((change) => {
        if (change.operation === "update") {
          facts.set(change.placeId, structuredClone(change.fact));
          placeSequence += 1;
          const revisionId = `40000000-0000-4000-8000-${String(placeSequence).padStart(12, "0")}`;
          revisions.set(change.placeId, revisionId);
          return {
            placeId: change.placeId,
            revisionId,
          };
        }
        const sourceRef = change.sources[0]!.ref;
        placeSequence += 1;
        const placeId = `20000000-0000-4000-8000-${String(placeSequence).padStart(12, "0")}`;
        targets.set(sourceRef, {
          status: "found",
          placeId,
          provenanceId: `30000000-0000-4000-8000-${String(placeSequence).padStart(12, "0")}`,
        });
        if (change.operation !== "retire" && change.operation !== "merge") {
          facts.set(placeId, structuredClone(change.fact));
        }
        revisions.set(
          placeId,
          `40000000-0000-4000-8000-${String(placeSequence).padStart(12, "0")}`,
        );
        return {
          placeId,
          revisionId: `40000000-0000-4000-8000-${String(placeSequence).padStart(12, "0")}`,
        };
      });
      return {
        status: "published",
        changesetId: `50000000-0000-4000-8000-${String(publishedCommands.length).padStart(12, "0")}`,
        changes,
        warnings: [],
        suggestions: [],
      };
    },
    now: () => new Date("2026-09-07T12:00:00.000Z"),
  };
  return { ports, targets, facts, publishedCommands };
}

const context = {
  actorId: "60000000-0000-4000-8000-000000000001",
  clientIp: "127.0.0.1",
};

describe("official facility resumable importer", () => {
  it("uses one database lock for every approval of the same manifest version", () => {
    const first = approveCampusMapOfficialFacilityManifest(
      manifest,
      "First reviewer",
      "2026-09-07",
    );
    const second = approveCampusMapOfficialFacilityManifest(
      manifest,
      "Second reviewer",
      "2026-09-08",
    );

    expect(first.manifestHash).not.toBe(second.manifestHash);
    expect(campusMapOfficialFacilityLockKey(first)).toBe(
      campusMapOfficialFacilityLockKey(second),
    );
    expect(campusMapOfficialFacilityLockKey(first)).toBe(
      `campus-map-official-facilities:${first.schemaVersion}:${first.manifestVersion}`,
    );
  });

  it("safely upgrades unchanged representative canary facts", async () => {
    const representative = getCampusMapRepresentativeFacilityManifest();
    const initialFactsByRef = new Map(
      representative.entries.map((entry) => [
        entry.change.sources[0]!.ref,
        entry.change.fact,
      ]),
    );
    const state = testPorts([...initialFactsByRef.keys()], initialFactsByRef);

    const result = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      { batch: "canary" },
      state.ports,
    );

    expect(result).toMatchObject({
      status: "imported",
      outcome: "published",
    });
    const updates = state.publishedCommands
      .flatMap((command) => command.changes)
      .filter((change) => change.operation === "update");
    expect(
      updates
        .map(
          (change) =>
            [...state.targets.entries()].find(
              ([, target]) =>
                target.status === "found" && target.placeId === change.placeId,
            )?.[0],
        )
        .toSorted(),
    ).toEqual(
      [
        "cuhk-osa:amenity:university-swimming-pool",
        "cuhk-umso:service:dental",
        "cuhk-umso:service:outpatient",
      ].toSorted(),
    );
    expect(
      updates.every(
        (change) =>
          change.sources.length > 0 &&
          change.sources.every(
            (source) =>
              ![...state.targets.entries()].some(
                ([sourceRef, target]) =>
                  target.status === "found" &&
                  target.placeId === change.placeId &&
                  source.ref === sourceRef,
              ),
          ),
      ),
    ).toBe(true);
  });

  it("does not upgrade a representative fact after a community edit", async () => {
    const representative = getCampusMapRepresentativeFacilityManifest();
    const pool = representative.entries.find(
      (entry) => entry.key === "osa-university-swimming-pool",
    )!;
    const sourceRef = pool.change.sources[0]!.ref;
    const editedFact = {
      ...pool.change.fact,
      name: `${pool.change.fact.name} (community edit)`,
    };
    const state = testPorts([sourceRef], new Map([[sourceRef, editedFact]]));

    const result = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      { batch: "canary" },
      state.ports,
    );

    expect(result).toMatchObject({
      status: "conflict",
      code: "manifest-existing-fact-differs",
      key: "osa-university-swimming-pool",
    });
    expect(state.publishedCommands).toHaveLength(0);
  });

  it("publishes canary chunks through the existing 25-change seam", async () => {
    const state = testPorts();
    const progress: CampusMapOfficialFacilityProgressRecord[] = [];
    const first = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      {
        batch: "canary",
        onProgress: (record) => {
          progress.push(record);
        },
      },
      state.ports,
    );

    expect(first).toMatchObject({
      status: "imported",
      outcome: "published",
      publishedChunks: 2,
      existingChunks: 0,
    });
    expect(
      state.publishedCommands.map((command) => command.changes.length),
    ).toEqual([25, 3]);
    expect(
      state.publishedCommands.every(
        (command) => command.warningAcknowledgements.length === 0,
      ),
    ).toBe(true);
    expect(progress.map((record) => record.status)).toEqual([
      "published",
      "published",
    ]);

    const replay = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      { batch: "canary" },
      state.ports,
    );
    expect(replay).toMatchObject({
      status: "imported",
      outcome: "already-present",
      publishedChunks: 0,
      existingChunks: 2,
    });
    expect(state.publishedCommands).toHaveLength(2);
  });

  it("blocks RES until every canary source is present", async () => {
    const state = testPorts();
    const result = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      { batch: "res" },
      state.ports,
    );
    expect(result).toMatchObject({
      status: "conflict",
      code: "canary-not-complete",
    });
    expect(state.publishedCommands).toHaveLength(0);
  });

  it("blocks RES while representative canary facts still need upgrading", async () => {
    const representative = getCampusMapRepresentativeFacilityManifest();
    const representativeFactsByRef = new Map(
      representative.entries.map((entry) => [
        entry.change.sources[0]!.ref,
        entry.change.fact,
      ]),
    );
    const canaryRefs = manifest.entries
      .filter(
        (entry) =>
          entry.batch === "canary" && entry.decision.status === "publish",
      )
      .map((entry) => entry.sourceRef);
    const state = testPorts(canaryRefs, representativeFactsByRef);

    const result = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      { batch: "res" },
      state.ports,
    );

    expect(result).toMatchObject({
      status: "conflict",
      code: "canary-not-complete",
    });
    expect(state.publishedCommands).toHaveLength(0);
  });

  it("resumes after a later chunk is rate-limited", async () => {
    const state = testPorts();
    let attempts = 0;
    const publishWithOnePause: CampusMapOfficialFacilityImportPorts["publish"] =
      async (command, publishContext) => {
        attempts += 1;
        if (attempts === 2) {
          return {
            status: "rate-limited",
            code: "publish-rate-limit",
            scope: "actor",
            policy: "burst",
            retryAfter: 30,
          };
        }
        return state.ports.publish(command, publishContext);
      };
    const progress: CampusMapOfficialFacilityProgressRecord[] = [];
    const paused = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      {
        batch: "canary",
        onProgress: (record) => {
          progress.push(record);
        },
      },
      { ...state.ports, publish: publishWithOnePause },
    );
    expect(paused).toMatchObject({
      status: "temporarily-unavailable",
      code: "publish-rate-limited",
      chunkKey: "canary-02",
      retryAfter: 30,
    });
    expect(progress.map((record) => record.chunkKey)).toEqual(["canary-01"]);

    const resumed = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      { batch: "canary" },
      state.ports,
    );
    expect(resumed).toMatchObject({
      status: "imported",
      outcome: "published",
      publishedChunks: 1,
      existingChunks: 1,
    });
    expect(
      state.publishedCommands.map((command) => command.changes.length),
    ).toEqual([25, 3]);
  });

  it("shows a Current fact diff instead of overwriting an existing Place", async () => {
    const state = testPorts();
    const first = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      { batch: "canary" },
      state.ports,
    );
    expect(first.status).toBe("imported");
    const firstCanary = manifest.entries.find(
      (entry) =>
        entry.batch === "canary" && entry.decision.status === "publish",
    )!;
    const target = state.targets.get(firstCanary.sourceRef)!;
    if (target.status !== "found") throw new Error("test source is missing");
    const current = state.facts.get(target.placeId)!;
    state.facts.set(target.placeId, {
      ...current,
      name: `${current.name} (community edit)`,
    });

    const replay = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      { batch: "canary" },
      state.ports,
    );
    expect(replay).toMatchObject({
      status: "conflict",
      code: "manifest-existing-fact-differs",
      key: firstCanary.key,
      differences: [
        {
          field: "name",
          current: `${current.name} (community edit)`,
          approved: current.name,
        },
      ],
    });
    expect(state.publishedCommands).toHaveLength(2);
  });

  it("prevalidates every canonical Building before source lookup or writes", async () => {
    const state = testPorts();
    const listBuildings = vi.fn(async () => testBuildings().slice(1));
    const resolveSource = vi.fn(state.ports.resolveSource);
    const publish = vi.fn(state.ports.publish);
    const result = await importCampusMapOfficialFacilitiesWithPorts(
      manifest,
      context,
      { batch: "canary" },
      { ...state.ports, listBuildings, resolveSource, publish },
    );
    expect(result).toMatchObject({
      status: "conflict",
      code: "canonical-building-missing",
    });
    expect(resolveSource).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
