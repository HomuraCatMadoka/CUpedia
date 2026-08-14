import { describe, expect, it } from "vitest";

import {
  DESKTOP_PRODUCT_NAVIGATION,
  isProductNavigationItemActive,
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

  it("marks product roots and descendants active without matching siblings", () => {
    expect(isProductNavigationItemActive("/courses", "/courses")).toBe(true);
    expect(isProductNavigationItemActive("/courses/CSCI3150", "/courses")).toBe(
      true,
    );
    expect(isProductNavigationItemActive("/course-tree", "/courses")).toBe(
      false,
    );
  });
});
