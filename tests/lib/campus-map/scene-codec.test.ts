import { describe, expect, it } from "vitest";

import {
  decodeCampusMapUrl,
  decodeCampusMapHistorySnapshot,
  encodeCampusMapUrl,
  encodeCampusMapHistorySnapshot,
  normalizeCampusMapHistorySession,
  normalizeCampusMapUrlSession,
} from "@/lib/campus-map/scene-codec";
import type {
  CampusMapSceneCatalog,
  CampusMapSession,
} from "@/lib/campus-map/scene-kernel";
import { EMPTY_CAMPUS_MAP_SCENE_SESSION } from "@/lib/campus-map/scene-kernel";

const catalog: CampusMapSceneCatalog = {
  categories: ["water", "classroom"],
  buildings: { science: { floorIds: ["G", "1", "4"] } },
  facilities: {
    fountain: {
      buildingId: "science",
      floorId: "1",
      category: "water",
    },
  },
  contents: {
    room401: {
      buildingId: "science",
      floorId: "4",
      category: "classroom",
      kind: "room",
    },
  },
};

describe("Campus Map versioned scene codec", () => {
  it("round-trips a facility URL without derived relationship fields", () => {
    const session: CampusMapSession = {
      mode: "browse",
      scene: { kind: "facility", facilityId: "fountain", snap: "full" },
    };

    const encoded = encodeCampusMapUrl(session, catalog);
    expect(encoded.toString()).toBe("v=1&scene=facility&id=fountain&snap=full");
    expect(encoded.has("building")).toBe(false);
    expect(encoded.has("floor")).toBe(false);
    expect(encoded.has("category")).toBe(false);
    expect(decodeCampusMapUrl(encoded, catalog)).toEqual({
      status: "decoded",
      session,
    });
  });

  it.each([
    [EMPTY_CAMPUS_MAP_SCENE_SESSION, "v=1", EMPTY_CAMPUS_MAP_SCENE_SESSION],
    [
      {
        mode: "browse",
        scene: { kind: "search-results", query: "science", snap: "peek" },
      },
      "v=1&scene=search&q=science&snap=peek",
      null,
    ],
    [
      {
        mode: "browse",
        scene: { kind: "category-results", category: "water", snap: "full" },
      },
      "v=1&scene=category&id=water&snap=full",
      null,
    ],
    [
      {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: "science",
          floorId: "4",
          snap: "peek",
        },
      },
      "v=1&scene=building&id=science&floor=4&snap=peek",
      null,
    ],
    [
      {
        mode: "browse",
        scene: { kind: "content", contentId: "room401", snap: "full" },
      },
      "v=1&scene=content&id=room401&snap=full",
      null,
    ],
    [
      {
        mode: "task",
        task: {
          kind: "create",
          anchor: { kind: "building", buildingId: "science" },
        },
      },
      "v=1&task=create&anchor=building&id=science",
      null,
    ],
    [
      {
        mode: "browse",
        scene: {
          kind: "provider-poi",
          provider: "amap",
          providerPoiId: "external",
          name: "External",
          position: [114.2, 22.4],
        },
      },
      "v=1",
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
    ],
  ] satisfies readonly [CampusMapSession, string, CampusMapSession | null][])(
    "stabilizes encode/decode/normalize for a canonical session",
    (session, encoded, normalizedOverride) => {
      expect(encodeCampusMapUrl(session, catalog).toString()).toBe(encoded);
      const normalized =
        normalizedOverride ?? normalizeCampusMapUrlSession(session, catalog);
      expect(decodeCampusMapUrl(encoded, catalog)).toEqual({
        status: "decoded",
        session: normalized,
      });
      expect(normalizeCampusMapUrlSession(normalized, catalog)).toEqual(
        normalized,
      );
    },
  );

  it("normalizes transient scenes out of versioned history snapshots", () => {
    const session: CampusMapSession = {
      mode: "browse",
      scene: {
        kind: "provider-poi",
        provider: "amap",
        providerPoiId: "external",
        name: "External",
        position: [114.2, 22.4],
      },
    };

    const encoded = encodeCampusMapHistorySnapshot(session, catalog, 3);
    expect(encoded).toEqual({
      campusMapScene: true,
      version: 1,
      depth: 3,
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
    });
    expect(decodeCampusMapHistorySnapshot(encoded, catalog)).toEqual({
      status: "decoded",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      depth: 3,
    });
    expect(normalizeCampusMapHistorySession(session, catalog)).toEqual(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
    );
  });

  it.each([
    EMPTY_CAMPUS_MAP_SCENE_SESSION,
    {
      mode: "browse",
      scene: { kind: "search-results", query: "science", snap: "peek" },
    },
    {
      mode: "browse",
      scene: { kind: "category-results", category: "water", snap: "full" },
    },
    {
      mode: "browse",
      scene: {
        kind: "building",
        buildingId: "science",
        floorId: "4",
        snap: "peek",
      },
    },
    {
      mode: "browse",
      scene: { kind: "facility", facilityId: "fountain", snap: "peek" },
    },
    {
      mode: "browse",
      scene: { kind: "content", contentId: "room401", snap: "full" },
    },
    {
      mode: "browse",
      scene: {
        kind: "provider-poi",
        provider: "amap",
        providerPoiId: "external",
        name: "External",
        position: [114.2, 22.4],
      },
    },
    {
      mode: "task",
      task: {
        kind: "create",
        anchor: { kind: "building", buildingId: "science" },
      },
    },
  ] satisfies readonly CampusMapSession[])(
    "keeps every canonical session stable through the history codec",
    (session) => {
      const normalized = normalizeCampusMapHistorySession(session, catalog);
      const encoded = encodeCampusMapHistorySnapshot(session, catalog, 2);
      expect(decodeCampusMapHistorySnapshot(encoded, catalog)).toEqual({
        status: "decoded",
        session: normalized,
        depth: 2,
      });
      expect(normalizeCampusMapHistorySession(normalized, catalog)).toEqual(
        normalized,
      );
    },
  );

  it.each([
    [
      "old version",
      {
        campusMapScene: true,
        version: 0,
        depth: 1,
        session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      },
      "unsupported-version",
    ],
    [
      "conflicting derived relationships",
      {
        campusMapScene: true,
        version: 1,
        depth: 1,
        session: {
          mode: "browse",
          scene: {
            kind: "facility",
            facilityId: "fountain",
            buildingId: "library",
            floorId: "G",
            category: "water",
            snap: "peek",
          },
        },
      },
      "conflicting-fields",
    ],
    [
      "missing deep-link entity",
      {
        campusMapScene: true,
        version: 1,
        depth: 2,
        session: {
          mode: "browse",
          scene: { kind: "content", contentId: "missing", snap: "full" },
        },
      },
      "unknown-entity",
    ],
    [
      "task snapshot with a present scene key",
      {
        campusMapScene: true,
        version: 1,
        depth: 1,
        session: {
          mode: "task",
          scene: undefined,
          task: { kind: "create", anchor: { kind: "map" } },
        },
      },
      "conflicting-fields",
    ],
    [
      "browse snapshot with a present task key",
      {
        campusMapScene: true,
        version: 1,
        depth: 1,
        session: {
          mode: "browse",
          scene: { kind: "map" },
          task: undefined,
        },
      },
      "conflicting-fields",
    ],
  ])("safely falls back for $0", (_label, snapshot, reason) => {
    expect(decodeCampusMapHistorySnapshot(snapshot, catalog)).toEqual({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      depth: 0,
      reason,
    });
  });

  it("safely falls back for invalid and conflicting deep links", () => {
    expect(
      decodeCampusMapUrl("v=1&scene=facility&id=missing&snap=peek", catalog),
    ).toMatchObject({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "unknown-entity",
    });
    expect(
      decodeCampusMapUrl(
        "v=1&scene=facility&id=fountain&building=science&snap=peek",
        catalog,
      ),
    ).toMatchObject({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "conflicting-fields",
    });
  });

  it.each(["toString", "constructor", "__proto__"])(
    "treats inherited catalog key %s as an unknown deep-link entity",
    (buildingId) => {
      for (const floor of ["", "&floor=1"]) {
        expect(
          decodeCampusMapUrl(
            `v=1&scene=building&id=${buildingId}${floor}&snap=peek`,
            catalog,
          ),
        ).toEqual({
          status: "fallback",
          session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
          reason: "unknown-entity",
        });
      }
    },
  );

  it("treats an inherited task anchor as an unknown history entity", () => {
    expect(
      decodeCampusMapHistorySnapshot(
        {
          campusMapScene: true,
          version: 1,
          depth: 1,
          session: {
            mode: "task",
            task: {
              kind: "create",
              anchor: { kind: "building", buildingId: "toString" },
            },
          },
        },
        catalog,
      ),
    ).toEqual({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      depth: 0,
      reason: "unknown-entity",
    });
  });

  it.each(["facility", "content"] as const)(
    "falls back when a %s relationship targets an inherited building key",
    (sceneKind) => {
      const invalidRelationshipCatalog: CampusMapSceneCatalog = {
        ...catalog,
        facilities: {
          ...catalog.facilities,
          inheritedBuilding: {
            buildingId: "toString",
            floorId: "1",
            category: "water",
          },
        },
        contents: {
          ...catalog.contents,
          inheritedBuilding: {
            buildingId: "toString",
            floorId: "1",
            category: "water",
            kind: "room",
          },
        },
      };

      expect(
        decodeCampusMapUrl(
          `v=1&scene=${sceneKind}&id=inheritedBuilding&snap=peek`,
          invalidRelationshipCatalog,
        ),
      ).toEqual({
        status: "fallback",
        session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
        reason: "unknown-entity",
      });
    },
  );

  it("fails closed for a malformed own catalog entry", () => {
    const malformedCatalog = {
      ...catalog,
      buildings: { malformed: {} },
    } as unknown as CampusMapSceneCatalog;

    expect(
      decodeCampusMapUrl(
        "v=1&scene=building&id=malformed&snap=peek",
        malformedCatalog,
      ),
    ).toEqual({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "unknown-entity",
    });
  });

  it("rejects a building whose required field is inherited", () => {
    const inheritedFieldCatalog = {
      ...catalog,
      buildings: { inherited: Object.create({ floorIds: ["1"] }) },
    } as CampusMapSceneCatalog;

    expect(
      decodeCampusMapUrl(
        "v=1&scene=building&id=inherited&floor=1&snap=peek",
        inheritedFieldCatalog,
      ),
    ).toEqual({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "unknown-entity",
    });
  });

  it("rejects a facility whose required fields are inherited", () => {
    const inheritedFieldCatalog = {
      ...catalog,
      facilities: {
        inherited: Object.create({
          buildingId: "science",
          floorId: "1",
          category: "water",
        }),
      },
    } as CampusMapSceneCatalog;

    expect(
      decodeCampusMapUrl(
        "v=1&scene=facility&id=inherited&snap=peek",
        inheritedFieldCatalog,
      ),
    ).toEqual({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "unknown-entity",
    });
  });

  it("rejects content whose kind is inherited", () => {
    const inheritedKind = Object.assign(Object.create({ kind: "room" }), {
      buildingId: "science",
      floorId: "1",
      category: "water",
    });
    const inheritedFieldCatalog = {
      ...catalog,
      contents: { inherited: inheritedKind },
    } as CampusMapSceneCatalog;

    expect(
      decodeCampusMapUrl(
        "v=1&scene=content&id=inherited&snap=peek",
        inheritedFieldCatalog,
      ),
    ).toEqual({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "unknown-entity",
    });
  });

  it("accepts a valid catalog entity whose own ID is a prototype name", () => {
    const ownPrototypeNameCatalog: CampusMapSceneCatalog = {
      ...catalog,
      buildings: { toString: { floorIds: ["1"] } },
    };

    expect(
      decodeCampusMapUrl(
        "v=1&scene=building&id=toString&floor=1&snap=peek",
        ownPrototypeNameCatalog,
      ),
    ).toEqual({
      status: "decoded",
      session: {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: "toString",
          floorId: "1",
          snap: "peek",
        },
      },
    });
  });

  it("fails closed without invoking a catalog field accessor", () => {
    let accessorInvoked = false;
    const accessorBuilding = {};
    Object.defineProperty(accessorBuilding, "floorIds", {
      get() {
        accessorInvoked = true;
        return ["1"];
      },
    });
    const accessorCatalog = {
      ...catalog,
      buildings: { accessor: accessorBuilding },
    } as unknown as CampusMapSceneCatalog;

    expect(
      decodeCampusMapUrl(
        "v=1&scene=building&id=accessor&floor=1&snap=peek",
        accessorCatalog,
      ),
    ).toEqual({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "unknown-entity",
    });
    expect(accessorInvoked).toBe(false);
  });

  it.each([
    ["building", "buildings"],
    ["facility", "facilities"],
    ["content", "contents"],
  ] as const)(
    "fails closed without invoking a %s catalog entry accessor",
    (sceneKind, catalogKey) => {
      let accessorInvoked = false;
      const entities = {};
      Object.defineProperty(entities, "accessor", {
        get() {
          accessorInvoked = true;
          throw new Error("catalog entry accessor must not run");
        },
      });
      const accessorCatalog = {
        ...catalog,
        [catalogKey]: entities,
      } as CampusMapSceneCatalog;

      expect(
        decodeCampusMapUrl(
          `v=1&scene=${sceneKind}&id=accessor&snap=peek`,
          accessorCatalog,
        ),
      ).toEqual({
        status: "fallback",
        session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
        reason: "unknown-entity",
      });
      expect(accessorInvoked).toBe(false);
    },
  );

  it.each([
    "v=1&id=ghost",
    "v=1&v=1",
    "v=1&scene=category&id=water&q=ghost&snap=peek",
    "v=1&task=create&anchor=map&snap=peek",
    "v=1&scene=facility&id=fountain&id=fountain&snap=peek",
  ])("rejects extra, repeated, or conflicting URL fields: %s", (input) => {
    expect(decodeCampusMapUrl(input, catalog)).toEqual({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "conflicting-fields",
    });
  });

  it("normalizes provider text before history encode/decode", () => {
    const session: CampusMapSession = {
      mode: "browse",
      scene: {
        kind: "provider-poi",
        provider: "amap",
        providerPoiId: " external ",
        name: " External ",
        position: [114.2, 22.4],
      },
    };

    expect(
      decodeCampusMapHistorySnapshot(
        encodeCampusMapHistorySnapshot(session, catalog, 1),
        catalog,
      ),
    ).toEqual({
      status: "decoded",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      depth: 1,
    });
  });
});
