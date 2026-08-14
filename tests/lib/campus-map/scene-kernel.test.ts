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
        history: "replace",
        camera: { kind: "cancel" },
        focus: { kind: "results" },
        overlay: { kind: "close-external" },
      },
    });
  });

  it("replaces result filters but pushes category navigation from an entity", () => {
    const categoryResults: CampusMapSession = {
      mode: "browse",
      scene: { kind: "category-results", category: "water", snap: "peek" },
    };
    const building: CampusMapSession = {
      mode: "browse",
      scene: {
        kind: "building",
        buildingId: "science",
        floorId: null,
        snap: "peek",
      },
    };

    expect(
      transitionCampusMapSession(
        categoryResults,
        { type: "OPEN_CATEGORY", category: "classroom" },
        catalog,
      ).commands.history,
    ).toBe("replace");
    expect(
      transitionCampusMapSession(
        building,
        { type: "OPEN_CATEGORY", category: "classroom" },
        catalog,
      ).commands.history,
    ).toBe("push");
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

  it("covers the complete scene × event transition contract", () => {
    type ExpectedTransition = ReturnType<typeof transitionCampusMapSession>;
    const sources = {
      map: EMPTY_CAMPUS_MAP_SCENE_SESSION,
      search: {
        mode: "browse",
        scene: { kind: "search-results", query: "science", snap: "peek" },
      },
      category: {
        mode: "browse",
        scene: { kind: "category-results", category: "water", snap: "peek" },
      },
      building: {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: "science",
          floorId: null,
          snap: "peek",
        },
      },
      facility: {
        mode: "browse",
        scene: { kind: "facility", facilityId: "fountain", snap: "peek" },
      },
      content: {
        mode: "browse",
        scene: { kind: "content", contentId: "room401", snap: "full" },
      },
      provider: {
        mode: "browse",
        scene: {
          kind: "provider-poi",
          provider: "amap",
          providerPoiId: "external",
          name: "External",
          position: [114.2, 22.4],
        },
      },
      task: {
        mode: "task",
        task: { kind: "create", anchor: { kind: "map" } },
      },
    } as const satisfies Record<string, CampusMapSession>;
    const browseSources = [
      "map",
      "search",
      "category",
      "building",
      "facility",
      "content",
      "provider",
    ] as const;
    const noCommands = {
      history: null,
      camera: null,
      focus: null,
      overlay: null,
    } as const;
    const accepted = (
      session: CampusMapSession,
      commands: ExpectedTransition["commands"],
    ): ExpectedTransition => ({ status: "accepted", session, commands });
    const rejected = (session: CampusMapSession): ExpectedTransition => ({
      status: "rejected",
      reason: "event-not-allowed",
      session,
      commands: noCommands,
    });
    let cellCount = 0;
    const verify = (
      sourceName: keyof typeof sources,
      event: CampusMapEvent,
      expected: ExpectedTransition,
    ) => {
      cellCount += 1;
      expect(
        transitionCampusMapSession(sources[sourceName], event, catalog),
        `${sourceName} × ${event.type}`,
      ).toEqual(expected);
    };

    const openMap = { type: "OPEN_MAP" } as const;
    verify("map", openMap, accepted(sources.map, noCommands));
    for (const source of browseSources.filter((name) => name !== "map")) {
      verify(
        source,
        openMap,
        accepted(sources.map, {
          history: "replace",
          camera: { kind: "cancel" },
          focus: { kind: "map" },
          overlay: { kind: "close-external" },
        }),
      );
    }
    verify("task", openMap, rejected(sources.task));

    const search = { type: "SEARCH", query: "library" } as const;
    const searched: CampusMapSession = {
      mode: "browse",
      scene: { kind: "search-results", query: "library", snap: "peek" },
    };
    for (const source of browseSources) {
      verify(
        source,
        search,
        accepted(searched, {
          history: "replace",
          camera: { kind: "cancel" },
          focus: { kind: "search-input" },
          overlay: { kind: "close-external" },
        }),
      );
    }
    verify("task", search, rejected(sources.task));

    const openCategory = {
      type: "OPEN_CATEGORY",
      category: "classroom",
    } as const;
    const classroom: CampusMapSession = {
      mode: "browse",
      scene: {
        kind: "category-results",
        category: "classroom",
        snap: "peek",
      },
    };
    for (const source of ["map", "search", "category", "provider"] as const) {
      verify(
        source,
        openCategory,
        accepted(classroom, {
          history: "replace",
          camera: { kind: "cancel" },
          focus: { kind: "results" },
          overlay: { kind: "close-external" },
        }),
      );
    }
    for (const source of ["building", "facility", "content"] as const) {
      verify(
        source,
        openCategory,
        accepted(classroom, {
          history: "push",
          camera: { kind: "cancel" },
          focus: { kind: "results" },
          overlay: { kind: "close-external" },
        }),
      );
    }
    verify("task", openCategory, rejected(sources.task));

    const openBuilding = {
      type: "OPEN_BUILDING",
      buildingId: "library",
      source: "map",
    } as const;
    const library: CampusMapSession = {
      mode: "browse",
      scene: {
        kind: "building",
        buildingId: "library",
        floorId: null,
        snap: "peek",
      },
    };
    for (const source of browseSources) {
      verify(
        source,
        openBuilding,
        accepted(library, {
          history: "push",
          camera: {
            kind: "focus",
            buildingId: "library",
            reason: "map-selection",
          },
          focus: { kind: "heading" },
          overlay: { kind: "close-external" },
        }),
      );
    }
    verify("task", openBuilding, rejected(sources.task));

    const openFacility = {
      type: "OPEN_FACILITY",
      facilityId: "fountain",
      source: "map",
    } as const;
    const fountain: CampusMapSession = {
      mode: "browse",
      scene: { kind: "facility", facilityId: "fountain", snap: "peek" },
    };
    for (const source of browseSources) {
      verify(
        source,
        openFacility,
        source === "facility"
          ? accepted(sources.facility, noCommands)
          : accepted(fountain, {
              history: "push",
              camera: {
                kind: "focus",
                buildingId: "science",
                reason: "facility-selection",
              },
              focus: { kind: "heading" },
              overlay: { kind: "close-external" },
            }),
      );
    }
    verify("task", openFacility, rejected(sources.task));

    const openContent = {
      type: "OPEN_CONTENT",
      contentId: "room401",
      source: "map",
    } as const;
    const room401: CampusMapSession = {
      mode: "browse",
      scene: { kind: "content", contentId: "room401", snap: "full" },
    };
    for (const source of browseSources) {
      verify(
        source,
        openContent,
        source === "content"
          ? accepted(sources.content, noCommands)
          : accepted(room401, {
              history: "push",
              camera: {
                kind: "focus",
                buildingId: "science",
                reason: "map-selection",
              },
              focus: { kind: "heading" },
              overlay: { kind: "close-external" },
            }),
      );
    }
    verify("task", openContent, rejected(sources.task));

    const openProvider = {
      type: "OPEN_PROVIDER_POI",
      providerPoiId: "external-2",
      name: "External 2",
      position: [114.21, 22.41],
    } as const;
    const external: CampusMapSession = {
      mode: "browse",
      scene: {
        kind: "provider-poi",
        provider: "amap",
        providerPoiId: "external-2",
        name: "External 2",
        position: [114.21, 22.41],
      },
    };
    for (const source of browseSources) {
      verify(
        source,
        openProvider,
        accepted(external, {
          history: null,
          camera: { kind: "cancel" },
          focus: { kind: "map" },
          overlay: {
            kind: "open-external",
            externalId: "external-2",
            name: "External 2",
            position: [114.21, 22.41],
          },
        }),
      );
    }
    verify("task", openProvider, rejected(sources.task));

    const setSnap = { type: "SET_SNAP", snap: "full" } as const;
    for (const source of ["map", "provider", "task"] as const) {
      verify(source, setSnap, rejected(sources[source]));
    }
    for (const source of [
      "search",
      "category",
      "building",
      "facility",
    ] as const) {
      const current = sources[source];
      if (current.mode !== "browse" || !("snap" in current.scene)) {
        throw new Error("sheet-bearing fixture expected");
      }
      verify(
        source,
        setSnap,
        accepted(
          { mode: "browse", scene: { ...current.scene, snap: "full" } },
          {
            history: "replace",
            camera: null,
            focus: { kind: "heading" },
            overlay: null,
          },
        ),
      );
    }
    verify("content", setSnap, accepted(sources.content, noCommands));

    const setFloor = { type: "SET_BUILDING_FLOOR", floorId: "4" } as const;
    for (const source of browseSources.filter((name) => name !== "building")) {
      verify(source, setFloor, rejected(sources[source]));
    }
    verify("task", setFloor, rejected(sources.task));
    verify(
      "building",
      setFloor,
      accepted(
        {
          mode: "browse",
          scene: { ...sources.building.scene, floorId: "4" },
        },
        {
          history: "replace",
          camera: null,
          focus: { kind: "results" },
          overlay: null,
        },
      ),
    );

    const startCreate = { type: "START_CREATE" } as const;
    const mapTask: CampusMapSession = {
      mode: "task",
      task: { kind: "create", anchor: { kind: "map" } },
    };
    const buildingTask: CampusMapSession = {
      mode: "task",
      task: {
        kind: "create",
        anchor: { kind: "building", buildingId: "science" },
      },
    };
    const createCommands = {
      history: "push",
      camera: { kind: "cancel" },
      focus: { kind: "contribution-form" },
      overlay: { kind: "close-external" },
    } as const;
    for (const source of ["map", "search", "category", "provider"] as const) {
      verify(source, startCreate, accepted(mapTask, createCommands));
    }
    for (const source of ["building", "facility", "content"] as const) {
      verify(source, startCreate, accepted(buildingTask, createCommands));
    }
    verify("task", startCreate, rejected(sources.task));

    const cancelTask = { type: "CANCEL_TASK" } as const;
    for (const source of browseSources) {
      verify(source, cancelTask, rejected(sources[source]));
    }
    verify(
      "task",
      cancelTask,
      accepted(sources.map, {
        history: "back-or-push",
        camera: { kind: "cancel" },
        focus: { kind: "map" },
        overlay: null,
      }),
    );

    const restore = {
      type: "RESTORE",
      session: EMPTY_CAMPUS_MAP_SCENE_SESSION,
    } as const;
    for (const source of Object.keys(sources) as (keyof typeof sources)[]) {
      verify(
        source,
        restore,
        accepted(sources.map, {
          history: null,
          camera: { kind: "cancel" },
          focus: { kind: "map" },
          overlay: { kind: "close-external" },
        }),
      );
    }

    expect(cellCount).toBe(96);
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
