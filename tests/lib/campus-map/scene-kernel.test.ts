import { describe, expect, it } from "vitest";

import {
  EMPTY_CAMPUS_MAP_SCENE_SESSION,
  resolveCampusMapScene,
  transitionCampusMapSession,
  type CampusMapSceneCatalog,
  type CampusMapEvent,
  type CampusMapSession,
} from "@/lib/campus-map/scene-kernel";

const catalog: CampusMapSceneCatalog = {
  categories: ["water", "classroom"],
  buildings: {
    science: { floorIds: ["G", "1", "4"] },
    library: { floorIds: ["G", "1"] },
  },
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

describe("Campus Map canonical scene transition", () => {
  it("returns to the canonical map scene through OPEN_MAP", () => {
    const building = transitionCampusMapSession(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_BUILDING", buildingId: "science", source: "map" },
      catalog,
    );

    expect(
      transitionCampusMapSession(
        building.session,
        { type: "OPEN_MAP" },
        catalog,
      ),
    ).toEqual({
      status: "accepted",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      commands: {
        history: "replace",
        camera: { kind: "cancel" },
        focus: { kind: "map" },
        overlay: { kind: "close-external" },
      },
    });
  });

  it("opens category results through one domain event", () => {
    const result = transitionCampusMapSession(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_CATEGORY", category: "water" },
      catalog,
    );

    expect(result).toEqual({
      status: "accepted",
      session: {
        mode: "browse",
        scene: { kind: "category-results", category: "water", snap: "peek" },
      },
      commands: {
        history: "push",
        camera: { kind: "cancel" },
        focus: { kind: "results" },
        overlay: { kind: "close-external" },
      },
    });
  });

  it("stores only a facility identity and derives its relationships", () => {
    const result = transitionCampusMapSession(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_FACILITY", facilityId: "fountain", source: "map" },
      catalog,
    );

    expect(result.status).toBe("accepted");
    expect(result.session).toEqual({
      mode: "browse",
      scene: { kind: "facility", facilityId: "fountain", snap: "peek" },
    });
    expect(resolveCampusMapScene(result.session, catalog)).toEqual({
      status: "valid",
      session: result.session,
      context: {
        buildingId: "science",
        floorId: "1",
        category: "water",
      },
    });
    expect(result.commands.camera).toEqual({
      kind: "focus",
      buildingId: "science",
      reason: "facility-selection",
    });
  });

  it("explicitly rejects an event with an unknown catalog entity", () => {
    const result = transitionCampusMapSession(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_FACILITY", facilityId: "missing", source: "map" },
      catalog,
    );

    expect(result).toEqual({
      status: "rejected",
      reason: "unknown-facility",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      commands: {
        history: null,
        camera: null,
        focus: null,
        overlay: null,
      },
    });
  });

  it.each([
    [
      { type: "SEARCH", query: "  science  " } as const,
      { kind: "search-results", query: "science", snap: "peek" },
    ],
    [
      { type: "OPEN_BUILDING", buildingId: "science", source: "map" } as const,
      { kind: "building", buildingId: "science", floorId: null, snap: "peek" },
    ],
    [
      { type: "OPEN_CONTENT", contentId: "room401", source: "map" } as const,
      { kind: "content", contentId: "room401", snap: "full" },
    ],
    [
      {
        type: "OPEN_PROVIDER_POI",
        providerPoiId: "amap-east-wing",
        name: "科学馆东座",
        position: [114.2084, 22.4198] as const,
      } as const,
      {
        kind: "provider-poi",
        provider: "amap",
        providerPoiId: "amap-east-wing",
        name: "科学馆东座",
        position: [114.2084, 22.4198],
      },
    ],
  ])("expresses the browse scene for $type", (event, scene) => {
    const result = transitionCampusMapSession(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      event,
      catalog,
    );

    expect(result.status).toBe("accepted");
    expect(result.session).toEqual({ mode: "browse", scene });
  });

  it("derives content relationships from the catalog", () => {
    const opened = transitionCampusMapSession(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_CONTENT", contentId: "room401", source: "building" },
      catalog,
    );

    expect(resolveCampusMapScene(opened.session, catalog)).toEqual({
      status: "valid",
      session: opened.session,
      context: {
        buildingId: "science",
        floorId: "4",
        category: "classroom",
      },
    });
    expect(opened.commands.camera).toEqual({ kind: "cancel" });
  });

  it("enters one contribution task and derives its canonical anchor", () => {
    const facility = transitionCampusMapSession(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_FACILITY", facilityId: "fountain", source: "map" },
      catalog,
    );
    const task = transitionCampusMapSession(
      facility.session,
      { type: "START_CREATE" },
      catalog,
    );

    expect(task.session).toEqual({
      mode: "task",
      task: {
        kind: "create",
        anchor: { kind: "building", buildingId: "science" },
      },
    });
    expect(task.commands).toEqual({
      history: "push",
      camera: { kind: "cancel" },
      focus: { kind: "contribution-form" },
      overlay: { kind: "close-external" },
    });

    const cancelled = transitionCampusMapSession(
      task.session,
      { type: "CANCEL_TASK" },
      catalog,
    );
    expect(cancelled.session).toEqual({
      mode: "browse",
      scene: {
        kind: "building",
        buildingId: "science",
        floorId: null,
        snap: "peek",
      },
    });
    expect(cancelled.commands.history).toBe("back-or-push");
  });

  it("accepts scene-specific SET_SNAP and SET_BUILDING_FLOOR events only", () => {
    const building = transitionCampusMapSession(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_BUILDING", buildingId: "science", source: "map" },
      catalog,
    );
    const floor = transitionCampusMapSession(
      building.session,
      { type: "SET_BUILDING_FLOOR", floorId: "4" },
      catalog,
    );
    const full = transitionCampusMapSession(
      floor.session,
      { type: "SET_SNAP", snap: "full" },
      catalog,
    );

    expect(full.session).toEqual({
      mode: "browse",
      scene: {
        kind: "building",
        buildingId: "science",
        floorId: "4",
        snap: "full",
      },
    });
    expect(full.commands.history).toBe("replace");

    expect(
      transitionCampusMapSession(
        EMPTY_CAMPUS_MAP_SCENE_SESSION,
        { type: "SET_SNAP", snap: "full" },
        catalog,
      ),
    ).toMatchObject({ status: "rejected", reason: "event-not-allowed" });
    expect(
      transitionCampusMapSession(
        building.session,
        { type: "SET_BUILDING_FLOOR", floorId: "missing" },
        catalog,
      ),
    ).toMatchObject({ status: "rejected", reason: "unknown-floor" });
  });

  it("restores Back and Forward scenes without a popstate history write", () => {
    const building = transitionCampusMapSession(
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_BUILDING", buildingId: "science", source: "map" },
      catalog,
    ).session;
    const facility = transitionCampusMapSession(
      building,
      { type: "OPEN_FACILITY", facilityId: "fountain", source: "building" },
      catalog,
    ).session;

    const back = transitionCampusMapSession(
      facility,
      { type: "RESTORE", session: building },
      catalog,
    );
    const forward = transitionCampusMapSession(
      back.session,
      { type: "RESTORE", session: facility },
      catalog,
    );

    expect(back.session).toEqual(building);
    expect(forward.session).toEqual(facility);
    expect(back.commands.history).toBeNull();
    expect(forward.commands.history).toBeNull();
    expect(forward.commands.camera).toEqual({
      kind: "focus",
      buildingId: "science",
      reason: "deep-link",
    });
  });

  it("normalizes a transient provider scene away during popstate restore", () => {
    const provider: CampusMapSession = {
      mode: "browse",
      scene: {
        kind: "provider-poi",
        provider: "amap",
        providerPoiId: "external",
        name: "External",
        position: [114.2, 22.4],
      },
    };

    expect(
      transitionCampusMapSession(
        EMPTY_CAMPUS_MAP_SCENE_SESSION,
        { type: "RESTORE", session: provider },
        catalog,
      ),
    ).toEqual({
      status: "accepted",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      commands: {
        history: null,
        camera: { kind: "cancel" },
        focus: { kind: "map" },
        overlay: { kind: "close-external" },
      },
    });
  });

  it.each([
    [
      {
        mode: "browse",
        scene: { kind: "category-results", category: "water", snap: "peek" },
      },
      { type: "OPEN_CATEGORY", category: "water" },
    ],
    [
      {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: "science",
          floorId: "4",
          snap: "full",
        },
      },
      { type: "OPEN_BUILDING", buildingId: "science", source: "map" },
    ],
    [
      {
        mode: "browse",
        scene: { kind: "facility", facilityId: "fountain", snap: "peek" },
      },
      { type: "OPEN_FACILITY", facilityId: "fountain", source: "map" },
    ],
    [
      {
        mode: "browse",
        scene: { kind: "content", contentId: "room401", snap: "full" },
      },
      { type: "OPEN_CONTENT", contentId: "room401", source: "map" },
    ],
  ] satisfies readonly (readonly [CampusMapSession, CampusMapEvent])[])(
    "makes repeated canonical entity intents explicitly idempotent",
    (session, event) => {
      expect(transitionCampusMapSession(session, event, catalog)).toEqual({
        status: "accepted",
        session,
        commands: {
          history: null,
          camera: null,
          focus: null,
          overlay: null,
        },
      });
    },
  );

  it.each([
    [
      {
        mode: "browse",
        scene: { kind: "facility", facilityId: "missing", snap: "peek" },
      },
      { type: "SET_SNAP", snap: "full" },
    ],
    [
      {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: "missing",
          floorId: null,
          snap: "peek",
        },
      },
      { type: "SET_BUILDING_FLOOR", floorId: null },
    ],
    [
      {
        mode: "task",
        task: {
          kind: "create",
          anchor: { kind: "building", buildingId: "missing" },
        },
      },
      { type: "CANCEL_TASK" },
    ],
  ] satisfies readonly (readonly [CampusMapSession, CampusMapEvent])[])(
    "rejects every event when the current session violates catalog invariants",
    (invalid, event) => {
      expect(transitionCampusMapSession(invalid, event, catalog)).toEqual({
        status: "rejected",
        reason: "invalid-session",
        session: invalid,
        commands: {
          history: null,
          camera: null,
          focus: null,
          overlay: null,
        },
      });
    },
  );

  it("covers the complete scene × event acceptance matrix", () => {
    const scenes = [
      ["map", EMPTY_CAMPUS_MAP_SCENE_SESSION, false, false],
      [
        "search-results",
        {
          mode: "browse",
          scene: { kind: "search-results", query: "science", snap: "peek" },
        },
        true,
        false,
      ],
      [
        "category-results",
        {
          mode: "browse",
          scene: { kind: "category-results", category: "water", snap: "peek" },
        },
        true,
        false,
      ],
      [
        "building",
        {
          mode: "browse",
          scene: {
            kind: "building",
            buildingId: "science",
            floorId: null,
            snap: "peek",
          },
        },
        true,
        true,
      ],
      [
        "facility",
        {
          mode: "browse",
          scene: { kind: "facility", facilityId: "fountain", snap: "peek" },
        },
        true,
        false,
      ],
      [
        "content",
        {
          mode: "browse",
          scene: { kind: "content", contentId: "room401", snap: "full" },
        },
        true,
        false,
      ],
      [
        "provider-poi",
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
        false,
        false,
      ],
      [
        "task",
        {
          mode: "task",
          task: { kind: "create", anchor: { kind: "map" } },
        },
        false,
        false,
      ],
    ] as const satisfies readonly (readonly [
      string,
      CampusMapSession,
      boolean,
      boolean,
    ])[];
    const events: readonly (readonly [
      CampusMapEvent,
      (
        mode: CampusMapSession["mode"],
        sheetBearing: boolean,
        building: boolean,
      ) => boolean,
    ])[] = [
      [{ type: "OPEN_MAP" }, (mode) => mode === "browse"],
      [{ type: "SEARCH", query: "science" }, (mode) => mode === "browse"],
      [
        { type: "OPEN_CATEGORY", category: "water" },
        (mode) => mode === "browse",
      ],
      [
        { type: "OPEN_BUILDING", buildingId: "science", source: "map" },
        (mode) => mode === "browse",
      ],
      [
        { type: "OPEN_FACILITY", facilityId: "fountain", source: "map" },
        (mode) => mode === "browse",
      ],
      [
        { type: "OPEN_CONTENT", contentId: "room401", source: "map" },
        (mode) => mode === "browse",
      ],
      [
        {
          type: "OPEN_PROVIDER_POI",
          providerPoiId: "external",
          name: "External",
          position: [114.2, 22.4],
        },
        (mode) => mode === "browse",
      ],
      [{ type: "SET_SNAP", snap: "full" }, (_mode, sheet) => sheet],
      [
        { type: "SET_BUILDING_FLOOR", floorId: "4" },
        (_mode, _sheet, building) => building,
      ],
      [{ type: "START_CREATE" }, (mode) => mode === "browse"],
      [{ type: "CANCEL_TASK" }, (mode) => mode === "task"],
      [
        { type: "RESTORE", session: EMPTY_CAMPUS_MAP_SCENE_SESSION },
        () => true,
      ],
    ];

    for (const [sceneName, session, sheetBearing, building] of scenes) {
      for (const [event, accepted] of events) {
        expect(
          transitionCampusMapSession(session, event, catalog).status,
          `${sceneName} × ${event.type}`,
        ).toBe(
          accepted(session.mode, sheetBearing, building)
            ? "accepted"
            : "rejected",
        );
      }
    }
  });

  it.each([
    [
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_CATEGORY", category: "missing" } as const,
      "unknown-category",
    ],
    [
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_BUILDING", buildingId: "missing", source: "map" } as const,
      "unknown-building",
    ],
    [
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "OPEN_CONTENT", contentId: "missing", source: "map" } as const,
      "unknown-content",
    ],
    [
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      {
        type: "OPEN_PROVIDER_POI",
        providerPoiId: "bad",
        name: "Bad",
        position: [Infinity, 22.4] as const,
      } as const,
      "invalid-provider-poi",
    ],
    [
      EMPTY_CAMPUS_MAP_SCENE_SESSION,
      { type: "CANCEL_TASK" } as const,
      "event-not-allowed",
    ],
    [
      {
        mode: "task",
        task: { kind: "create", anchor: { kind: "map" } },
      } as const,
      { type: "OPEN_CATEGORY", category: "water" } as const,
      "event-not-allowed",
    ],
  ])("rejects an illegal scene × event contract", (session, event, reason) => {
    const result = transitionCampusMapSession(session, event, catalog);
    expect(result).toEqual({
      status: "rejected",
      reason,
      session,
      commands: {
        history: null,
        camera: null,
        focus: null,
        overlay: null,
      },
    });
  });
});
