/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SIDEBAR_COLLAPSED_ATTRIBUTE,
  SIDEBAR_PREFERENCE_BOOTSTRAP_SCRIPT,
  SIDEBAR_PREFERENCE_STORAGE_KEY,
} from "@/lib/sidebar-preference";

describe("sidebar desktop preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute(SIDEBAR_COLLAPSED_ATTRIBUTE);
    document.cookie = "wiki-sidebar-collapsed=; path=/; max-age=0";
  });

  afterEach(() => {
    window.localStorage.clear();
    document.cookie = "wiki-sidebar-collapsed=; path=/; max-age=0";
  });

  it("uses a versioned, product-scoped storage key", () => {
    expect(SIDEBAR_PREFERENCE_STORAGE_KEY).toBe(
      "cupedia:wiki-sidebar-shell:v1",
    );
  });

  it("bootstraps the DOM from storage before React hydrates", () => {
    window.localStorage.setItem(SIDEBAR_PREFERENCE_STORAGE_KEY, "collapsed");
    window.eval(SIDEBAR_PREFERENCE_BOOTSTRAP_SCRIPT);

    expect(SIDEBAR_PREFERENCE_BOOTSTRAP_SCRIPT).toContain(
      SIDEBAR_PREFERENCE_STORAGE_KEY,
    );
    expect(
      document.documentElement.hasAttribute(SIDEBAR_COLLAPSED_ATTRIBUTE),
    ).toBe(true);
  });

  it("keeps expanded as the default when there is no stored exception", () => {
    window.eval(SIDEBAR_PREFERENCE_BOOTSTRAP_SCRIPT);

    expect(
      document.documentElement.hasAttribute(SIDEBAR_COLLAPSED_ATTRIBUTE),
    ).toBe(false);
  });

  it("migrates and removes the legacy collapsed cookie", () => {
    document.cookie = "wiki-sidebar-collapsed=collapsed; path=/";

    window.eval(SIDEBAR_PREFERENCE_BOOTSTRAP_SCRIPT);

    expect(window.localStorage.getItem(SIDEBAR_PREFERENCE_STORAGE_KEY)).toBe(
      "collapsed",
    );
    expect(
      document.documentElement.hasAttribute(SIDEBAR_COLLAPSED_ATTRIBUTE),
    ).toBe(true);
    expect(document.cookie).not.toContain("wiki-sidebar-collapsed=");
  });
});
