import { describe, expect, it, vi } from "vitest";

import {
  CampusMapSceneDriver,
  type CampusMapSceneDriverPorts,
} from "@/lib/campus-map/scene-driver";
import type { CampusMapSceneCatalog } from "@/lib/campus-map/scene-kernel";

const catalog: CampusMapSceneCatalog = {
  categories: ["toilet", "water"],
  buildings: {
    science: { floorIds: ["G", "1"] },
    library: { floorIds: ["G"] },
  },
  facilities: {
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
    locationPending: {
      buildingId: null,
      floorId: null,
      category: "water",
      cameraTarget: null,
    },
  },
  contents: {},
};

function harness(initialSearch = "?v=1", clearStartEffects = true) {
  let state: unknown = null;
  let search = initialSearch;
  const history = {
    get state() {
      return state;
    },
    back: vi.fn(),
    pushState: vi.fn(
      (nextState: unknown, _unused: string, url?: string | URL | null) => {
        state = nextState;
        search = new URL(String(url), "https://example.test").search;
      },
    ),
    replaceState: vi.fn(
      (nextState: unknown, _unused: string, url?: string | URL | null) => {
        state = nextState;
        search = new URL(String(url), "https://example.test").search;
      },
    ),
  };
  const ports: CampusMapSceneDriverPorts = {
    history,
    location: {
      pathname: () => "/campus-map",
      search: () => search,
    },
    camera: vi.fn(),
    focus: vi.fn(),
    sheet: vi.fn(),
  };
  const driver = new CampusMapSceneDriver(catalog, ports, initialSearch);
  driver.start();
  vi.mocked(history.replaceState).mockClear();
  if (clearStartEffects) {
    vi.mocked(ports.camera).mockClear();
    vi.mocked(ports.focus).mockClear();
    vi.mocked(ports.sheet).mockClear();
  }
  return {
    driver,
    history,
    ports,
    get search() {
      return search;
    },
    setState(value: unknown) {
      state = value;
    },
  };
}

describe("CampusMapSceneDriver", () => {
  it("owns a transient provider-target error without writing canonical history", () => {
    const runtime = harness();
    const intentToken = runtime.driver.getSnapshot().transitionToken;

    expect(
      runtime.driver.dispatch({
        type: "REPORT_PROVIDER_TARGET_UNAVAILABLE",
        title: "高德正式地点",
        intentToken,
      }),
    ).toMatchObject({ status: "committed" });

    expect(runtime.driver.getSnapshot()).toMatchObject({
      session: { mode: "browse", scene: { kind: "map" } },
      transientPanel: {
        kind: "provider-target-unavailable",
        title: "高德正式地点",
        snap: "peek",
      },
    });
    expect(runtime.history.pushState).not.toHaveBeenCalled();
    expect(runtime.history.replaceState).not.toHaveBeenCalled();
    expect(runtime.ports.sheet).toHaveBeenCalledOnce();
    expect(runtime.ports.sheet).toHaveBeenCalledWith(
      { kind: "show", snap: "peek" },
      expect.any(Object),
    );
  });

  it("dismisses a transient provider-target error and rejects its stale owner", () => {
    const runtime = harness();
    const intentToken = runtime.driver.getSnapshot().transitionToken;
    runtime.driver.dispatch({
      type: "REPORT_PROVIDER_TARGET_UNAVAILABLE",
      title: "过期高德地点",
      intentToken,
    });
    vi.mocked(runtime.ports.sheet).mockClear();

    expect(
      runtime.driver.dispatch({ type: "DISMISS_TRANSIENT_PANEL" }),
    ).toMatchObject({ status: "committed" });
    expect(runtime.driver.getSnapshot().transientPanel).toBeNull();
    expect(runtime.history.pushState).not.toHaveBeenCalled();
    expect(runtime.history.replaceState).not.toHaveBeenCalled();
    expect(runtime.ports.sheet).toHaveBeenCalledWith(
      { kind: "hide" },
      expect.any(Object),
    );

    expect(
      runtime.driver.dispatch({
        type: "REPORT_PROVIDER_TARGET_UNAVAILABLE",
        title: "过期高德地点",
        intentToken,
      }),
    ).toEqual({ status: "superseded" });
    expect(runtime.driver.getSnapshot().transientPanel).toBeNull();
  });

  it("lets generic dismiss close only the transient panel", () => {
    const runtime = harness();
    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "science",
      source: "map",
    });
    runtime.driver.dispatch({
      type: "SET_SNAP",
      snap: "full",
    });
    runtime.driver.dispatch({
      type: "REPORT_PROVIDER_TARGET_UNAVAILABLE",
      title: "高德正式地点",
      intentToken: runtime.driver.getSnapshot().transitionToken,
    });
    vi.mocked(runtime.ports.sheet).mockClear();

    runtime.driver.dispatch({ type: "DISMISS" });

    expect(runtime.driver.getSnapshot()).toMatchObject({
      session: {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: "science",
          snap: "full",
        },
      },
      transientPanel: null,
    });
    expect(runtime.ports.sheet).toHaveBeenCalledWith(
      { kind: "show", snap: "full" },
      expect.any(Object),
    );
  });

  it("clears a transient provider-target error on newer canonical navigation", () => {
    const runtime = harness();
    runtime.driver.dispatch({
      type: "REPORT_PROVIDER_TARGET_UNAVAILABLE",
      title: "高德正式地点",
      intentToken: runtime.driver.getSnapshot().transitionToken,
    });

    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "science",
      source: "map",
    });

    expect(runtime.driver.getSnapshot()).toMatchObject({
      session: {
        mode: "browse",
        scene: { kind: "building", buildingId: "science" },
      },
      transientPanel: null,
    });
  });

  it("projects a deep link through one complete start transition", () => {
    const runtime = harness("?v=1&scene=facility&id=fountain&snap=peek", false);

    expect(runtime.ports.camera).toHaveBeenCalledTimes(1);
    expect(runtime.ports.camera).toHaveBeenCalledWith(
      {
        kind: "focus",
        buildingId: "science",
        reason: "deep-link",
      },
      expect.any(Object),
    );
    expect(runtime.ports.focus).toHaveBeenCalledTimes(1);
    expect(runtime.ports.focus).toHaveBeenCalledWith(
      { kind: "heading" },
      expect.any(Object),
    );
    expect(runtime.ports.sheet).toHaveBeenCalledTimes(1);
    expect(runtime.ports.sheet).toHaveBeenCalledWith(
      { kind: "show", snap: "peek" },
      expect.any(Object),
    );
  });

  it.each([
    [
      "outdoor Place point",
      "courtyardWater",
      {
        kind: "focus-place",
        placeId: "courtyardWater",
        reason: "deep-link",
      },
    ],
    ["no camera target", "locationPending", { kind: "cancel" }],
  ])("restores a Place deep link with %s", (_label, facilityId, camera) => {
    const runtime = harness(
      `?v=1&scene=facility&id=${facilityId}&snap=peek`,
      false,
    );

    expect(runtime.driver.getSnapshot().session).toMatchObject({
      mode: "browse",
      scene: { kind: "facility", facilityId },
    });
    expect(runtime.ports.camera).toHaveBeenCalledWith(
      camera,
      expect.any(Object),
    );
  });

  it.each([
    [
      "marker",
      null,
      { type: "OPEN_FACILITY", facilityId: "fountain", source: "map" } as const,
    ],
    [
      "category list",
      { type: "OPEN_CATEGORY", category: "water" } as const,
      { type: "OPEN_FACILITY", facilityId: "fountain", source: "map" } as const,
    ],
    [
      "building directory",
      { type: "OPEN_BUILDING", buildingId: "science", source: "map" } as const,
      {
        type: "OPEN_FACILITY",
        facilityId: "fountain",
        source: "building",
      } as const,
    ],
  ])(
    "opens one canonical facility from the %s with one command per effect",
    (_entry, setup, intent) => {
      const runtime = harness();
      if (setup) runtime.driver.dispatch(setup);
      vi.mocked(runtime.history.pushState).mockClear();
      vi.mocked(runtime.history.replaceState).mockClear();
      vi.mocked(runtime.ports.camera).mockClear();
      vi.mocked(runtime.ports.focus).mockClear();
      vi.mocked(runtime.ports.sheet).mockClear();

      runtime.driver.dispatch(intent);

      expect(runtime.driver.getSnapshot().session).toEqual({
        mode: "browse",
        scene: { kind: "facility", facilityId: "fountain", snap: "peek" },
      });
      expect(runtime.search).toBe("?v=1&scene=facility&id=fountain&snap=peek");
      expect(runtime.history.pushState).toHaveBeenCalledTimes(1);
      expect(runtime.ports.camera).toHaveBeenCalledTimes(1);
      expect(runtime.ports.focus).toHaveBeenCalledTimes(1);
      expect(runtime.ports.sheet).toHaveBeenCalledTimes(1);
    },
  );

  it("switches category atomically without stale entity, query, building, or return target", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "SEARCH", query: "science" });
    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "science",
      source: "search",
    });
    runtime.driver.dispatch({ type: "SET_BUILDING_FLOOR", floorId: "1" });
    runtime.driver.dispatch({
      type: "OPEN_FACILITY",
      facilityId: "fountain",
      source: "building",
    });

    runtime.driver.dispatch({ type: "OPEN_CATEGORY", category: "toilet" });

    expect(runtime.driver.getSnapshot()).toMatchObject({
      session: {
        mode: "browse",
        scene: { kind: "category-results", category: "toilet", snap: "peek" },
      },
      returnTo: null,
    });
    expect(runtime.search).toBe("?v=1&scene=category&id=toilet&snap=peek");
  });

  it("uses the real predecessor for Back and a building fallback for a direct facility deep link", () => {
    const navigated = harness();
    navigated.driver.dispatch({ type: "OPEN_CATEGORY", category: "water" });
    navigated.driver.dispatch({
      type: "OPEN_FACILITY",
      facilityId: "fountain",
      source: "map",
    });
    vi.mocked(navigated.history.pushState).mockClear();
    vi.mocked(navigated.ports.camera).mockClear();

    navigated.driver.dispatch({ type: "NAVIGATE_BACK" });

    expect(navigated.history.back).toHaveBeenCalledTimes(1);
    expect(navigated.history.pushState).not.toHaveBeenCalled();
    expect(navigated.ports.camera).not.toHaveBeenCalled();

    const direct = harness("?v=1&scene=facility&id=fountain&snap=peek");
    direct.driver.dispatch({ type: "NAVIGATE_BACK" });
    expect(direct.history.back).not.toHaveBeenCalled();
    expect(direct.driver.getSnapshot().session).toEqual({
      mode: "browse",
      scene: {
        kind: "building",
        buildingId: "science",
        floorId: "1",
        snap: "peek",
      },
    });
    expect(direct.history.pushState).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "building-only Place",
      "lobbyWater",
      {
        kind: "building",
        buildingId: "science",
        floorId: null,
        snap: "peek",
      },
    ],
    ["outdoor Place", "courtyardWater", { kind: "map" }],
    ["Place without camera target", "locationPending", { kind: "map" }],
  ])(
    "uses a safe direct-link Back fallback for a %s",
    (_label, facilityId, scene) => {
      const runtime = harness(`?v=1&scene=facility&id=${facilityId}&snap=peek`);

      runtime.driver.dispatch({ type: "NAVIGATE_BACK" });

      expect(runtime.driver.getSnapshot().session).toEqual({
        mode: "browse",
        scene,
      });
    },
  );

  it("keeps only the latest Place during rapid A to B and out-of-order camera work", () => {
    const pending: Array<() => void> = [];
    const executed: string[] = [];
    const runtime = harness();
    vi.mocked(runtime.ports.camera).mockImplementation((command, context) => {
      pending.push(() => {
        if (context.isCurrent()) executed.push(command.kind);
      });
    });

    runtime.driver.dispatch({
      type: "OPEN_FACILITY",
      facilityId: "courtyardWater",
      source: "map",
    });
    runtime.driver.dispatch({
      type: "OPEN_FACILITY",
      facilityId: "lobbyWater",
      source: "search",
    });
    pending[1]!();
    pending[0]!();

    expect(runtime.driver.getSnapshot().session).toMatchObject({
      mode: "browse",
      scene: { kind: "facility", facilityId: "lobbyWater" },
    });
    expect(executed).toEqual(["focus"]);
  });

  it.each(["X", "Escape"])("keeps %s dismissal independent from Back", () => {
    const runtime = harness("?v=1&scene=facility&id=fountain&snap=peek");

    runtime.driver.dispatch({ type: "DISMISS" });

    expect(runtime.history.back).not.toHaveBeenCalled();
    expect(runtime.driver.getSnapshot().session).toEqual({
      mode: "browse",
      scene: { kind: "map" },
    });
    expect(runtime.history.replaceState).toHaveBeenCalledTimes(1);
  });

  it("returns a searched facility to its query and uses the search camera reason", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "SEARCH", query: "science fountain" });
    runtime.driver.dispatch({
      type: "OPEN_FACILITY",
      facilityId: "fountain",
      source: "search",
    });

    expect(runtime.driver.getSnapshot().returnTo).toEqual({
      mode: "browse",
      scene: {
        kind: "search-results",
        query: "science fountain",
        snap: "peek",
      },
    });
    expect(runtime.ports.camera).toHaveBeenLastCalledWith(
      {
        kind: "focus",
        buildingId: "science",
        reason: "search-selection",
      },
      expect.objectContaining({ token: 2 }),
    );

    runtime.driver.dispatch({ type: "DISMISS" });
    expect(runtime.driver.getSnapshot().session).toEqual({
      mode: "browse",
      scene: {
        kind: "search-results",
        query: "science fountain",
        snap: "peek",
      },
    });
    expect(runtime.ports.focus).toHaveBeenLastCalledWith(
      { kind: "result", resultId: "fountain" },
      expect.any(Object),
    );
  });

  it("routes a cluster fit through one driver camera command", () => {
    const runtime = harness();

    runtime.driver.dispatch({
      type: "FIT_CLUSTER",
      positions: [
        [114.2, 22.4],
        [114.21, 22.41],
      ],
    });

    expect(runtime.ports.camera).toHaveBeenCalledTimes(1);
    expect(runtime.ports.camera).toHaveBeenCalledWith(
      {
        kind: "fit",
        positions: [
          [114.2, 22.4],
          [114.21, 22.41],
        ],
      },
      expect.any(Object),
    );
  });

  it("keeps repeated intent idempotent without changing the return target or replaying effects", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "SEARCH", query: "science" });
    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "science",
      source: "search",
    });
    const before = runtime.driver.getSnapshot();
    vi.mocked(runtime.history.pushState).mockClear();
    vi.mocked(runtime.history.replaceState).mockClear();
    vi.mocked(runtime.ports.camera).mockClear();
    vi.mocked(runtime.ports.focus).mockClear();
    vi.mocked(runtime.ports.sheet).mockClear();

    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "science",
      source: "map",
    });

    expect(runtime.driver.getSnapshot()).toBe(before);
    expect(runtime.history.pushState).not.toHaveBeenCalled();
    expect(runtime.history.replaceState).not.toHaveBeenCalled();
    expect(runtime.ports.camera).not.toHaveBeenCalled();
    expect(runtime.ports.focus).not.toHaveBeenCalled();
    expect(runtime.ports.sheet).not.toHaveBeenCalled();
  });

  it("initializes browser history only once", () => {
    const runtime = harness();

    runtime.driver.start();

    expect(runtime.history.replaceState).not.toHaveBeenCalled();
  });

  it("restores popstate from the canonical URL without writing history", () => {
    const runtime = harness();
    const push = runtime.history.pushState;
    const replace = runtime.history.replaceState;
    vi.mocked(push).mockClear();
    vi.mocked(replace).mockClear();

    runtime.driver.restore("?v=1&scene=building&id=library&snap=peek", {
      campusMapScene: true,
      version: 1,
      depth: 0,
    });

    expect(runtime.driver.getSnapshot().session).toMatchObject({
      mode: "browse",
      scene: { kind: "building", buildingId: "library" },
    });
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("restores focus to the Place trigger when Back returns to a Building", () => {
    const runtime = harness();
    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "science",
      source: "map",
    });
    runtime.driver.dispatch({
      type: "OPEN_FACILITY",
      facilityId: "fountain",
      source: "building",
    });
    vi.mocked(runtime.ports.focus).mockClear();

    runtime.driver.restore("?v=1&scene=building&id=science&snap=peek", {
      campusMapScene: true,
      version: 1,
      depth: 1,
    });

    expect(runtime.ports.focus).toHaveBeenCalledWith(
      { kind: "result", resultId: "fountain" },
      expect.any(Object),
    );
  });

  it("keeps the kernel focus when the restored Building has no matching Place trigger", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "OPEN_CATEGORY", category: "water" });
    runtime.driver.dispatch({
      type: "OPEN_FACILITY",
      facilityId: "courtyardWater",
      source: "map",
    });
    vi.mocked(runtime.ports.focus).mockClear();

    runtime.driver.restore("?v=1&scene=building&id=science&snap=peek", {
      campusMapScene: true,
      version: 1,
      depth: 1,
    });

    expect(runtime.ports.focus).toHaveBeenCalledWith(
      { kind: "heading" },
      expect.any(Object),
    );
  });

  it("clears transient provider state on restore and rejects its late response", () => {
    const runtime = harness();
    const staleToken = runtime.driver.getSnapshot().transitionToken;
    runtime.driver.dispatch({
      type: "REPORT_PROVIDER_TARGET_UNAVAILABLE",
      title: "高德正式地点",
      intentToken: staleToken,
    });

    runtime.driver.restore("?v=1&scene=building&id=library&snap=peek", {
      campusMapScene: true,
      version: 1,
      depth: 0,
    });

    expect(runtime.driver.getSnapshot()).toMatchObject({
      session: {
        mode: "browse",
        scene: { kind: "building", buildingId: "library" },
      },
      transientPanel: null,
    });
    expect(
      runtime.driver.dispatch({
        type: "REPORT_PROVIDER_TARGET_UNAVAILABLE",
        title: "过期高德地点",
        intentToken: staleToken,
      }),
    ).toEqual({ status: "superseded" });
  });

  it("replays a replacement task after an earlier task's Back completes", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "START_CREATE" });
    vi.mocked(runtime.history.pushState).mockClear();

    runtime.driver.dispatch({ type: "CANCEL_TASK" });
    const queued = runtime.driver.dispatch({ type: "START_CREATE" });

    expect(runtime.history.back).toHaveBeenCalledOnce();
    expect(queued).toMatchObject({ status: "queued" });
    expect(runtime.history.pushState).not.toHaveBeenCalled();

    const restored = runtime.driver.restore("?v=1", {
      campusMapScene: true,
      version: 1,
      depth: 0,
    });

    expect(restored).toMatchObject({
      status: "restored",
      completedPendingReturn: true,
      preservedReplacementTask: true,
    });
    expect(runtime.driver.getSnapshot().session).toEqual({
      mode: "task",
      task: { kind: "create", anchor: { kind: "map" } },
    });
    expect(runtime.search).toBe("?v=1&task=create&anchor=map");
    expect(runtime.history.pushState).toHaveBeenCalledOnce();
  });

  it("does not let an older browse Back overwrite a newer selection", () => {
    const runtime = harness();
    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "science",
      source: "map",
    });
    vi.mocked(runtime.history.pushState).mockClear();

    runtime.driver.dispatch({ type: "NAVIGATE_BACK" });
    const queued = runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "library",
      source: "map",
    });

    expect(queued).toMatchObject({ status: "queued" });
    expect(runtime.history.pushState).not.toHaveBeenCalled();

    runtime.driver.restore("?v=1", {
      campusMapScene: true,
      version: 1,
      depth: 0,
    });

    expect(runtime.driver.getSnapshot().session).toEqual({
      mode: "browse",
      scene: {
        kind: "building",
        buildingId: "library",
        floorId: null,
        snap: "peek",
      },
    });
    expect(runtime.search).toBe("?v=1&scene=building&id=library&snap=peek");
    expect(runtime.history.pushState).toHaveBeenCalledOnce();
  });

  it("opens a replacement task's published Place after the older Back completes", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "START_CREATE" });
    runtime.driver.dispatch({ type: "CANCEL_TASK" });
    runtime.driver.dispatch({ type: "START_CREATE" });
    const intentToken = runtime.driver.getIntentToken();
    (catalog.facilities as Record<string, object>).queuedPublishedWater = {
      buildingId: null,
      floorId: null,
      category: "water",
      cameraTarget: "place-point",
    };
    vi.mocked(runtime.history.pushState).mockClear();

    expect(
      runtime.driver.openPublishedPlace("queuedPublishedWater", intentToken),
    ).toEqual({ status: "applied" });

    runtime.driver.restore("?v=1", {
      campusMapScene: true,
      version: 1,
      depth: 0,
    });

    expect(runtime.driver.getSnapshot().session).toEqual({
      mode: "browse",
      scene: {
        kind: "facility",
        facilityId: "queuedPublishedWater",
        snap: "peek",
      },
    });
    expect(runtime.search).toBe(
      "?v=1&scene=facility&id=queuedPublishedWater&snap=peek",
    );
    expect(runtime.history.pushState).toHaveBeenCalledOnce();
  });

  it("keeps newer navigation over a queued published Place handoff", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "START_CREATE" });
    runtime.driver.dispatch({ type: "CANCEL_TASK" });
    runtime.driver.dispatch({ type: "START_CREATE" });
    const intentToken = runtime.driver.getIntentToken();
    (catalog.facilities as Record<string, object>).supersededPublishedWater = {
      buildingId: null,
      floorId: null,
      category: "water",
      cameraTarget: "place-point",
    };
    runtime.driver.openPublishedPlace("supersededPublishedWater", intentToken);

    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "library",
      source: "map",
    });
    runtime.driver.restore("?v=1", {
      campusMapScene: true,
      version: 1,
      depth: 0,
    });

    expect(runtime.driver.getSnapshot().session).toMatchObject({
      mode: "browse",
      scene: { kind: "building", buildingId: "library" },
    });
  });

  it("carries a third task into the second pending Back acknowledgement", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "START_CREATE" });
    runtime.driver.dispatch({ type: "CANCEL_TASK" });
    runtime.driver.dispatch({ type: "START_CREATE" });
    runtime.driver.dispatch({ type: "CANCEL_TASK" });
    runtime.driver.dispatch({ type: "START_CREATE" });

    runtime.driver.restore("?v=1", {
      campusMapScene: true,
      version: 1,
      depth: 0,
    });
    expect(runtime.history.back).toHaveBeenCalledTimes(2);

    runtime.driver.restore("?v=1", {
      campusMapScene: true,
      version: 1,
      depth: 0,
    });

    expect(runtime.driver.getSnapshot().session).toEqual({
      mode: "task",
      task: { kind: "create", anchor: { kind: "map" } },
    });
    expect(runtime.search).toBe("?v=1&task=create&anchor=map");
  });

  it("restores Back and Forward across an outdoor Place without writing history", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "OPEN_CATEGORY", category: "water" });
    runtime.driver.dispatch({
      type: "OPEN_FACILITY",
      facilityId: "courtyardWater",
      source: "map",
    });
    vi.mocked(runtime.history.pushState).mockClear();
    vi.mocked(runtime.history.replaceState).mockClear();

    runtime.driver.restore("?v=1&scene=category&id=water&snap=peek", {
      campusMapScene: true,
      version: 1,
      depth: 0,
    });
    expect(runtime.driver.getSnapshot().session).toMatchObject({
      mode: "browse",
      scene: { kind: "category-results", category: "water" },
    });

    runtime.driver.restore("?v=1&scene=facility&id=courtyardWater&snap=peek", {
      campusMapScene: true,
      version: 1,
      depth: 1,
    });
    expect(runtime.driver.getSnapshot().session).toMatchObject({
      mode: "browse",
      scene: { kind: "facility", facilityId: "courtyardWater" },
    });
    expect(runtime.history.pushState).not.toHaveBeenCalled();
    expect(runtime.history.replaceState).not.toHaveBeenCalled();
  });

  it("invalidates stale camera work for rapid transitions and user gestures", () => {
    const pending: Array<() => void> = [];
    const executedTokens: number[] = [];
    const runtime = harness();
    vi.mocked(runtime.ports.camera).mockImplementation((_command, context) => {
      pending.push(() => {
        if (context.isCurrent()) executedTokens.push(context.token);
      });
    });

    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "science",
      source: "map",
    });
    runtime.driver.dispatch({
      type: "OPEN_BUILDING",
      buildingId: "library",
      source: "map",
    });
    pending[0]();
    pending[1]();
    expect(executedTokens).toEqual([2]);

    runtime.driver.dispatch({ type: "REFRAME", reason: "sheet-layout" });
    runtime.driver.interruptCamera();
    pending[2]();
    expect(executedTokens).toEqual([2]);
  });

  it("routes edit-position camera work through the existing driver only", () => {
    const runtime = harness();

    runtime.driver.recenterEditPosition([114.2101, 22.4198], "draft-restore");

    expect(runtime.ports.camera).toHaveBeenCalledWith(
      {
        kind: "edit-position",
        position: [114.2101, 22.4198],
        reason: "draft-restore",
      },
      expect.any(Object),
    );
    expect(runtime.history.pushState).not.toHaveBeenCalled();
    expect(runtime.history.replaceState).not.toHaveBeenCalled();
    expect(runtime.ports.focus).not.toHaveBeenCalled();
    expect(runtime.ports.sheet).not.toHaveBeenCalled();
  });

  it("replaces a published task with its canonical Place without leaving a publishable Back entry", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "START_CREATE" });
    const intentToken = runtime.driver.getIntentToken();
    (catalog.facilities as Record<string, object>).publishedWater = {
      buildingId: null,
      floorId: null,
      category: "water",
      cameraTarget: "place-point",
    };
    vi.mocked(runtime.history.pushState).mockClear();
    vi.mocked(runtime.history.replaceState).mockClear();

    expect(
      runtime.driver.openPublishedPlace("publishedWater", intentToken),
    ).toMatchObject({ status: "applied" });

    expect(runtime.driver.getSnapshot().session).toEqual({
      mode: "browse",
      scene: {
        kind: "facility",
        facilityId: "publishedWater",
        snap: "peek",
      },
    });
    expect(runtime.history.pushState).not.toHaveBeenCalled();
    expect(runtime.history.replaceState).toHaveBeenCalledOnce();
  });

  it("rejects a late publish handoff after the user navigates elsewhere", () => {
    const runtime = harness();
    runtime.driver.dispatch({ type: "START_CREATE" });
    const intentToken = runtime.driver.getIntentToken();
    runtime.driver.dispatch({ type: "CANCEL_TASK" });
    (catalog.facilities as Record<string, object>).lateWater = {
      buildingId: null,
      floorId: null,
      category: "water",
      cameraTarget: "place-point",
    };

    expect(runtime.driver.openPublishedPlace("lateWater", intentToken)).toEqual(
      {
        status: "superseded",
      },
    );
    expect(runtime.driver.getSnapshot().session).not.toMatchObject({
      scene: { facilityId: "lateWater" },
    });
  });
});
