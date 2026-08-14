import { describe, expect, it } from "vitest";

import {
  DESKTOP_PRODUCT_NAVIGATION,
  getActiveProductNavigationId,
  PRODUCT_NAVIGATION,
} from "@/lib/product-navigation";

describe("product navigation", () => {
  it("keeps one ordered source for every currently accessible product", () => {
    expect(PRODUCT_NAVIGATION.map(({ href }) => href)).toEqual([
      "/wiki",
      "/college-picker",
      "/campus-bus",
      "/canteen",
      "/canteen/shit-rank",
      "/courses",
    ]);
    expect(new Set(PRODUCT_NAVIGATION.map(({ id }) => id)).size).toBe(
      PRODUCT_NAVIGATION.length,
    );
    expect(PRODUCT_NAVIGATION.every(({ href }) => href.startsWith("/"))).toBe(
      true,
    );
  });

  it("derives the desktop links without copying their configuration", () => {
    expect(DESKTOP_PRODUCT_NAVIGATION).toEqual(
      PRODUCT_NAVIGATION.filter(({ desktop }) => desktop),
    );
    expect(DESKTOP_PRODUCT_NAVIGATION.map(({ href }) => href)).not.toContain(
      "/wiki",
    );
  });

  it("resolves exactly one active product using the longest registered route", () => {
    expect(getActiveProductNavigationId("/courses")).toBe("courses");
    expect(getActiveProductNavigationId("/courses/CSCI3150")).toBe("courses");
    expect(getActiveProductNavigationId("/canteen")).toBe("canteen");
    expect(getActiveProductNavigationId("/canteen/menu")).toBe("canteen");
    expect(getActiveProductNavigationId("/canteen/shit-rank")).toBe(
      "canteen-rank",
    );
    expect(getActiveProductNavigationId("/canteen/shit-rank/archive")).toBe(
      "canteen-rank",
    );
    expect(getActiveProductNavigationId("/course-tree")).toBeUndefined();
  });
});
