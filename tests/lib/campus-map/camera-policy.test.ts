import { describe, expect, it } from "vitest";

import {
  CameraRequestGate,
  cameraPolicyFor,
  deriveCameraPadding,
  placementAnchorPoint,
  type ScreenRect,
} from "@/lib/campus-map/camera-policy";

const desktopMap: ScreenRect = {
  top: 0,
  right: 1440,
  bottom: 900,
  left: 0,
};

describe("campus map camera policy", () => {
  it("uses the visible map centre as the mobile placement anchor", () => {
    expect(placementAnchorPoint({ width: 390, height: 720 })).toEqual({
      x: 195,
      y: expect.closeTo(187.2, 10),
    });
    expect(placementAnchorPoint({ width: 720, height: 390 })).toEqual({
      x: 360,
      y: expect.closeTo(101.4, 10),
    });
    expect(placementAnchorPoint({ width: 1440, height: 900 })).toEqual({
      x: 720,
      y: 450,
    });
  });

  it("derives right padding from a desktop side panel's actual overlap", () => {
    expect(
      deriveCameraPadding(desktopMap, {
        top: 20,
        right: 1420,
        bottom: 880,
        left: 1000,
      }),
    ).toEqual({ top: 24, right: 444, bottom: 24, left: 24 });
  });

  it("derives bottom padding from a mobile sheet without a breakpoint", () => {
    const map = { top: 0, right: 390, bottom: 844, left: 0 };
    expect(
      deriveCameraPadding(map, {
        top: 504,
        right: 390,
        bottom: 844,
        left: 0,
      }),
    ).toEqual({ top: 24, right: 24, bottom: 364, left: 24 });
  });

  it("keeps treating a portrait full sheet as a bottom occlusion", () => {
    const map = { top: 0, right: 390, bottom: 688, left: 0 };
    expect(
      deriveCameraPadding(map, {
        top: 192.640625,
        right: 390,
        bottom: 688,
        left: 0,
      }),
    ).toEqual({
      top: 24,
      right: 24,
      bottom: 519.359375,
      left: 24,
    });
  });

  it("uses only the base safe gap for a panel outside the map", () => {
    expect(
      deriveCameraPadding(desktopMap, {
        top: 0,
        right: 1800,
        bottom: 900,
        left: 1500,
      }),
    ).toEqual({ top: 24, right: 24, bottom: 24, left: 24 });
  });

  it("clips a partially off-screen panel to the map before measuring", () => {
    expect(
      deriveCameraPadding(desktopMap, {
        top: -50,
        right: 1500,
        bottom: 950,
        left: 1200,
      }),
    ).toEqual({ top: 24, right: 264, bottom: 24, left: 24 });
  });

  it("preserves zoom for map, facility, and sheet-layout interactions", () => {
    expect(cameraPolicyFor("map-selection", desktopMap, null)?.zoom).toEqual({
      kind: "preserve",
    });
    expect(
      cameraPolicyFor("facility-selection", desktopMap, null)?.zoom,
    ).toEqual({
      kind: "preserve",
    });
    expect(cameraPolicyFor("sheet-layout", desktopMap, null)?.zoom).toEqual({
      kind: "preserve",
    });
  });

  it("caps zoom only for search and deep links", () => {
    expect(cameraPolicyFor("search-selection", desktopMap, null)).toMatchObject(
      {
        zoom: { kind: "fit", maxZoom: 17.2 },
        animate: true,
      },
    );
    expect(cameraPolicyFor("deep-link", desktopMap, null)).toMatchObject({
      zoom: { kind: "fit", maxZoom: 17.2 },
      animate: false,
    });
  });

  it.each(["building-floor", "building-amenity", "building-query"] as const)(
    "does not move the camera for %s",
    (reason) => {
      expect(cameraPolicyFor(reason, desktopMap, null)).toBeNull();
    },
  );

  it("invalidates stale async camera requests", () => {
    const gate = new CameraRequestGate();
    const science = gate.begin();
    const library = gate.begin();

    expect(science.isCurrent()).toBe(false);
    expect(library.isCurrent()).toBe(true);

    gate.invalidate();
    expect(library.isCurrent()).toBe(false);
  });
});
