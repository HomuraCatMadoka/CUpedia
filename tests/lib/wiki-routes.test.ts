import { describe, expect, it } from "vitest";
import {
  isCanonicalWikiPageId,
  isFocusedWikiEditorRoute,
  isWikiBrowsingRoute,
} from "@/lib/wiki-routes";

describe("isFocusedWikiEditorRoute", () => {
  it("uses the focused shell for canonical UUID page routes", () => {
    expect(
      isFocusedWikiEditorRoute("/wiki/019c58f4-09d3-4db8-862a-468e26724409"),
    ).toBe(true);
  });

  it("does not treat wiki indexes or nested utility routes as page editors", () => {
    expect(isFocusedWikiEditorRoute("/wiki")).toBe(false);
    expect(isFocusedWikiEditorRoute("/wiki/search")).toBe(false);
    expect(
      isFocusedWikiEditorRoute(
        "/wiki/history/019c58f4-09d3-4db8-862a-468e26724409",
      ),
    ).toBe(false);
  });
});

describe("isWikiBrowsingRoute", () => {
  it("uses the shared Header Wiki variant only for ordinary Wiki routes", () => {
    expect(isWikiBrowsingRoute("/wiki")).toBe(true);
    expect(isWikiBrowsingRoute("/wiki/search")).toBe(true);
    expect(
      isWikiBrowsingRoute("/wiki/history/019c58f4-09d3-4db8-862a-468e26724409"),
    ).toBe(true);
    expect(
      isWikiBrowsingRoute("/wiki/019c58f4-09d3-4db8-862a-468e26724409"),
    ).toBe(false);
    expect(isWikiBrowsingRoute("/courses")).toBe(false);
  });
});

describe("isCanonicalWikiPageId", () => {
  it("accepts only a canonical UUID page id", () => {
    expect(isCanonicalWikiPageId("019c58f4-09d3-4db8-862a-468e26724409")).toBe(
      true,
    );
    expect(isCanonicalWikiPageId("search")).toBe(false);
    expect(isCanonicalWikiPageId("../admin")).toBe(false);
  });
});
