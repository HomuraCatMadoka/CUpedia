import { describe, expect, it, vi } from "vitest";

import {
  CampusMapBrowserHistory,
  type CampusMapHistoryPort,
} from "@/lib/campus-map/browser-history";
import { EMPTY_CAMPUS_MAP_SESSION } from "@/lib/campus-map/map-session";

function historyPort() {
  let currentState: unknown = null;
  const port: CampusMapHistoryPort = {
    get state() {
      return currentState;
    },
    back: vi.fn(),
    pushState: vi.fn((state) => {
      currentState = state;
    }),
    replaceState: vi.fn((state) => {
      currentState = state;
    }),
  };
  return port;
}

describe("CampusMapBrowserHistory", () => {
  it("owns semantic push and replace snapshots", () => {
    const port = historyPort();
    const adapter = new CampusMapBrowserHistory(port, () => "/campus-map");

    const restored = adapter.initialize(EMPTY_CAMPUS_MAP_SESSION);
    expect(restored).toBe(EMPTY_CAMPUS_MAP_SESSION);
    expect(port.replaceState).toHaveBeenCalledTimes(1);

    expect(adapter.commit(EMPTY_CAMPUS_MAP_SESSION, "push")).toBe("committed");
    expect(port.pushState).toHaveBeenCalledTimes(1);
    expect(port.state).toMatchObject({ campusMap: true, depth: 1 });
  });

  it("travels back instead of committing the fallback when a predecessor exists", () => {
    const port = historyPort();
    const adapter = new CampusMapBrowserHistory(port, () => "/campus-map");
    adapter.initialize(EMPTY_CAMPUS_MAP_SESSION);
    adapter.commit(EMPTY_CAMPUS_MAP_SESSION, "push");
    vi.mocked(port.pushState).mockClear();

    expect(adapter.commit(EMPTY_CAMPUS_MAP_SESSION, "back-or-push")).toBe(
      "travelled",
    );
    expect(port.back).toHaveBeenCalledTimes(1);
    expect(port.pushState).not.toHaveBeenCalled();
  });

  it("pushes a reversible fallback when a direct deep link has no predecessor", () => {
    const port = historyPort();
    const adapter = new CampusMapBrowserHistory(port, () => "/campus-map");
    adapter.initialize(EMPTY_CAMPUS_MAP_SESSION);

    expect(adapter.commit(EMPTY_CAMPUS_MAP_SESSION, "back-or-push")).toBe(
      "committed",
    );
    expect(port.back).not.toHaveBeenCalled();
    expect(port.pushState).toHaveBeenCalledTimes(1);
    expect(port.state).toMatchObject({ campusMap: true, depth: 1 });
  });

  it("reads the current popstate snapshot and updates its depth", () => {
    const port = historyPort();
    const adapter = new CampusMapBrowserHistory(port, () => "/campus-map");
    adapter.initialize(EMPTY_CAMPUS_MAP_SESSION);
    adapter.commit(EMPTY_CAMPUS_MAP_SESSION, "push");

    expect(adapter.restore(EMPTY_CAMPUS_MAP_SESSION)).toBe(
      EMPTY_CAMPUS_MAP_SESSION,
    );
    expect(adapter.depth).toBe(1);
  });
});
