import { describe, expect, it } from "vitest";
import { isFocusedWikiEditorRoute } from "@/lib/wiki-routes";

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
