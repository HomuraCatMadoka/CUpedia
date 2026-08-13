/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CAMPUS_BUS_HOME_TAB_STORAGE_KEY,
  CampusBusHome,
} from "@/components/campus-transport/campus-bus-home";
import { toCampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import { getCampusBusRoute } from "@/lib/campus-transport/routes-data";

let getCurrentPosition: ReturnType<typeof vi.fn>;
let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  getCurrentPosition = vi.fn();
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  Object.defineProperty(window.navigator, "permissions", {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderHome() {
  return render(
    <CampusBusHome
      initialNow={Date.UTC(2026, 7, 10, 23, 38)}
      modelOperationsEnabled={false}
      routes={[
        toCampusBusPassengerRoute(getCampusBusRoute("1a")!),
        toCampusBusPassengerRoute(getCampusBusRoute("3")!),
      ]}
    />,
  );
}

describe("CampusBusHome", () => {
  it("defaults to Nearby without requesting location", () => {
    renderHome();

    expect(
      screen.getByRole("tab", { name: "附近" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "使用我的位置" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "現在可乘" })).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "附近" }));
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("switches independently to the complete route catalog and remembers the explicit choice", () => {
    renderHome();
    fireEvent.click(screen.getByRole("tab", { name: "全部路線" }));

    expect(screen.getByRole("heading", { name: "現在可乘" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "其他路線" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "使用我的位置" })).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(
      JSON.parse(window.localStorage.getItem(CAMPUS_BUS_HOME_TAB_STORAGE_KEY)!),
    ).toEqual({ tab: "routes", version: 1 });
  });

  it("supports roving keyboard navigation without requesting location", () => {
    renderHome();
    const nearbyTab = screen.getByRole("tab", { name: "附近" });
    nearbyTab.focus();
    fireEvent.keyDown(nearbyTab, { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: "全部路線" })).toHaveProperty(
      "tabIndex",
      0,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "全部路線" }),
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("restores only a valid versioned tab and never renders fake recent routes", () => {
    window.localStorage.setItem(
      CAMPUS_BUS_HOME_TAB_STORAGE_KEY,
      JSON.stringify({ tab: "routes", version: 1 }),
    );
    renderHome();

    expect(
      screen
        .getByRole("tab", { name: "全部路線" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByText(/最近/)).toBeNull();
    cleanup();

    window.localStorage.setItem(
      CAMPUS_BUS_HOME_TAB_STORAGE_KEY,
      JSON.stringify({ tab: "routes", version: 0 }),
    );
    renderHome();
    expect(
      screen.getByRole("tab", { name: "附近" }).getAttribute("aria-selected"),
    ).toBe("true");
  });
});
