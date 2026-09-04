import { describe, expect, it } from "vitest";

import {
  decodeCampusMapUrl,
  decodeCampusMapHistoryMetadata,
  encodeCampusMapPlaceHref,
  encodeCampusMapUrl,
  encodeCampusMapHistoryMetadata,
  normalizeCampusMapUrlSession,
} from "@/lib/campus-map/scene-codec";
import type {
  CampusMapSceneCatalog,
  CampusMapSession,
} from "@/lib/campus-map/scene-kernel";
import { EMPTY_CAMPUS_MAP_SCENE_SESSION } from "@/lib/campus-map/scene-kernel";

import { buildNonCanonicalCampusMapIdentityCases } from "./canonical-id-fixtures";

const catalog: CampusMapSceneCatalog = {
  categories: ["water", "classroom"],
  buildings: { science: { floorIds: ["G", "1", "4"] } },
  places: {
    fountain: {
      buildingId: "science",
      floorId: "1",
      category: "water",
      cameraTarget: "building-anchor",
    },
    lobbyWater: {
      buildingId: "science",
      floorId: null,
      category: "water",
      cameraTarget: "building-anchor",
    },
    courtyardWater: {
      buildingId: null,
      floorId: null,
      category: "water",
      cameraTarget: "place-point",
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
  it("owns canonical Place deep links used outside the runtime", () => {
    expect(
      encodeCampusMapPlaceHref("courtyardWater", {
        status: "active",
        visibility: "public",
      }),
    ).toBe("/campus-map?v=1&scene=place&id=courtyardWater&snap=peek");
    expect(
      encodeCampusMapPlaceHref(" courtyardWater ", {
        status: "active",
        visibility: "public",
      }),
    ).toBe("/campus-map?v=1");
    expect(
      encodeCampusMapPlaceHref("retiredPlace", {
        status: "retired",
        visibility: "public",
      }),
    ).toBe("/campus-map?v=1");
    expect(
      encodeCampusMapPlaceHref("redactedPlace", {
        status: "active",
        visibility: "redacted",
      }),
    ).toBe("/campus-map?v=1");
  });

  it("round-trips a canonical Map Note return context for refresh recovery", () => {
    const session: CampusMapSession = {
      mode: "task",
      task: {
        kind: "edit",
        placeId: "fountain",
        returnContext: {
          kind: "map-note",
          noteId: "72000000-0000-4000-8000-000000000003",
        },
      },
    };

    const encoded = encodeCampusMapUrl(session, catalog);
    expect(encoded.toString()).toBe(
      "v=1&task=edit&id=fountain&returnNote=72000000-0000-4000-8000-000000000003",
    );
    expect(decodeCampusMapUrl(encoded, catalog)).toEqual({
      status: "decoded",
      session,
    });
    expect(
      decodeCampusMapUrl(
        "v=1&task=edit&id=fountain&returnNote=NOT-A-CANONICAL-UUID",
        catalog,
      ),
    ).toMatchObject({ status: "fallback", reason: "invalid-return-context" });
  });

  it("normalizes a legacy full facility URL to its compact card", () => {
    const session = {
      mode: "browse",
      scene: { kind: "place", placeId: "fountain", snap: "full" },
    } as unknown as CampusMapSession;

    const encoded = encodeCampusMapUrl(session, catalog);
    expect(encoded.toString()).toBe("v=1&scene=place&id=fountain&snap=peek");
    expect(encoded.has("building")).toBe(false);
    expect(encoded.has("floor")).toBe(false);
    expect(encoded.has("category")).toBe(false);
    expect(
      decodeCampusMapUrl("v=1&scene=place&id=fountain&snap=full", catalog),
    ).toEqual({
      status: "decoded",
      session: {
        mode: "browse",
        scene: { kind: "place", placeId: "fountain", snap: "peek" },
      },
    });
  });

  it.each(["fountain", "lobbyWater", "courtyardWater"])(
    "restores %s from the same stable Place deep link after refresh",
    (placeId) => {
      const session: CampusMapSession = {
        mode: "browse",
        scene: { kind: "place", placeId, snap: "peek" },
      };
      const url = encodeCampusMapUrl(session, catalog).toString();

      expect(url).toBe(`v=1&scene=place&id=${placeId}&snap=peek`);
      expect(decodeCampusMapUrl(url, catalog)).toEqual({
        status: "decoded",
        session,
      });
    },
  );

  it.each(buildNonCanonicalCampusMapIdentityCases(catalog))(
    "falls back consistently for a non-canonical $label",
    ({ catalog: nonCanonicalCatalog, session }) => {
      const normalized = normalizeCampusMapUrlSession(
        session,
        nonCanonicalCatalog,
      );
      const encoded = encodeCampusMapUrl(session, nonCanonicalCatalog);

      expect(normalized).toEqual(EMPTY_CAMPUS_MAP_SCENE_SESSION);
      expect(encoded.toString()).toBe("v=1");
      expect(decodeCampusMapUrl(encoded, nonCanonicalCatalog)).toEqual({
        status: "decoded",
        session: normalized,
      });
    },
  );

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
        mode: "task",
        task: { kind: "edit", placeId: "fountain" },
      },
      "v=1&task=edit&id=fountain",
      null,
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

  it("round-trips only versioned navigation metadata in history state", () => {
    const encoded = encodeCampusMapHistoryMetadata(3);
    expect(encoded).toEqual({
      campusMapScene: true,
      version: 1,
      depth: 3,
    });
    expect(decodeCampusMapHistoryMetadata(encoded)).toEqual({
      status: "decoded",
      depth: 3,
    });
  });

  it.each([
    [
      "old version",
      {
        campusMapScene: true,
        version: 0,
        depth: 1,
      },
      "unsupported-version",
    ],
    [
      "negative depth",
      {
        campusMapScene: true,
        version: 1,
        depth: -1,
      },
      "invalid-snapshot",
    ],
    [
      "legacy session payload",
      {
        campusMapScene: true,
        version: 1,
        depth: 2,
        session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      },
      "conflicting-fields",
    ],
    [
      "inherited metadata",
      Object.create({ campusMapScene: true, version: 1, depth: 2 }),
      "invalid-snapshot",
    ],
  ])("safely falls back for $0", (_label, snapshot, reason) => {
    expect(decodeCampusMapHistoryMetadata(snapshot)).toEqual({
      status: "fallback",
      depth: 0,
      reason,
    });
  });

  it("safely falls back for invalid and conflicting deep links", () => {
    expect(
      decodeCampusMapUrl("v=1&scene=place&id=missing&snap=peek", catalog),
    ).toMatchObject({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "unknown-entity",
    });
    expect(
      decodeCampusMapUrl(
        "v=1&scene=place&id=fountain&building=science&snap=peek",
        catalog,
      ),
    ).toMatchObject({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "conflicting-fields",
    });
  });

  it.each([
    "v=1&scene=category&id=%20water%20&snap=peek",
    "v=1&scene=building&id=%20science%20&snap=peek",
    "v=1&scene=building&id=science&floor=%204%20&snap=peek",
    "v=1&scene=place&id=%20fountain%20&snap=peek",
    "v=1&scene=content&id=%20room401%20&snap=full",
    "v=1&task=create&anchor=building&id=%20science%20",
  ])(
    "falls back instead of trimming a non-canonical URL identity: %s",
    (input) => {
      expect(decodeCampusMapUrl(input, catalog)).toEqual({
        status: "fallback",
        session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
        reason: "invalid-identity",
      });
    },
  );

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

  it.each(["place", "content"] as const)(
    "falls back when a %s relationship targets an inherited building key",
    (sceneKind) => {
      const invalidRelationshipCatalog: CampusMapSceneCatalog = {
        ...catalog,
        places: {
          ...catalog.places,
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

  it.each([
    "v=1&id=ghost",
    "v=1&v=1",
    "v=1&scene=category&id=water&q=ghost&snap=peek",
    "v=1&task=create&anchor=map&snap=peek",
    "v=1&scene=place&id=fountain&id=fountain&snap=peek",
  ])("rejects extra, repeated, or conflicting URL fields: %s", (input) => {
    expect(decodeCampusMapUrl(input, catalog)).toEqual({
      status: "fallback",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      reason: "conflicting-fields",
    });
  });
});
