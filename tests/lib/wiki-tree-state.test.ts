import { describe, expect, it } from "vitest";

import {
  createWikiTreeState,
  projectWikiTreePages,
  reorderWikiSiblings,
  reorderWikiTreeSiblings,
  wikiTreeReducer,
  type WikiTreePage,
} from "@/lib/wiki-tree-state";

const pages: WikiTreePage[] = [
  {
    id: "root",
    title: "Root",
    icon: null,
    parentId: null,
    sortOrder: 0,
  },
  {
    id: "child",
    title: "Child",
    icon: null,
    parentId: "root",
    sortOrder: 1,
  },
  {
    id: "grandchild",
    title: "Grandchild",
    icon: null,
    parentId: "child",
    sortOrder: 2,
  },
];

describe("wiki tree mutation projection", () => {
  it("uses one sibling reorder rule for moves, boundaries, and invalid targets", () => {
    const siblings = [
      { id: "first", sortOrder: 0 },
      { id: "second", sortOrder: 1 },
      { id: "third", sortOrder: 2 },
    ];

    expect(reorderWikiSiblings(siblings, "third", { direction: "up" })).toEqual(
      {
        status: "moved",
        siblings: [
          { id: "first", sortOrder: 0 },
          { id: "third", sortOrder: 1 },
          { id: "second", sortOrder: 2 },
        ],
      },
    );
    expect(reorderWikiSiblings(siblings, "first", { direction: "up" })).toEqual(
      { status: "unchanged" },
    );
    expect(
      reorderWikiSiblings(siblings, "missing", { direction: "down" }),
    ).toEqual({ status: "source-not-found" });
    expect(
      reorderWikiSiblings(siblings, "first", {
        targetPageId: "missing",
        placement: "after",
      }),
    ).toEqual({ status: "target-not-found" });
    expect(siblings.map((sibling) => sibling.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("projects and confirms a renamed, re-iconed nested move", () => {
    let state = createWikiTreeState(pages);
    const moved = {
      ...pages[2],
      title: "Moved",
      icon: "🧭",
      parentId: "root",
    };

    state = wikiTreeReducer(state, {
      type: "project",
      mutation: { token: "move-1", type: "upsert", page: moved },
    });
    expect(projectWikiTreePages(state)).toContainEqual(moved);

    state = wikiTreeReducer(state, {
      type: "confirm",
      token: "move-1",
      page: { ...moved, title: "Moved by server" },
    });
    expect(state.pending).toHaveLength(0);
    expect(projectWikiTreePages(state)).toContainEqual({
      ...moved,
      title: "Moved by server",
    });
  });

  it("keeps a newer projection when an older mutation confirms", () => {
    let state = createWikiTreeState(pages);
    state = wikiTreeReducer(state, {
      type: "project",
      mutation: {
        token: "rename-1",
        type: "upsert",
        page: { ...pages[0], title: "First" },
      },
    });
    state = wikiTreeReducer(state, {
      type: "project",
      mutation: {
        token: "rename-2",
        type: "upsert",
        page: { ...pages[0], title: "Second" },
      },
    });

    state = wikiTreeReducer(state, {
      type: "confirm",
      token: "rename-1",
      page: { ...pages[0], title: "First confirmed" },
    });

    expect(
      projectWikiTreePages(state).find((page) => page.id === "root")?.title,
    ).toBe("Second");
  });

  it("does not let an older pending mutation cover a newer early response", () => {
    let state = createWikiTreeState(pages);
    state = wikiTreeReducer(state, {
      type: "project",
      mutation: {
        token: "rename-1",
        type: "upsert",
        page: { ...pages[0], title: "First" },
      },
    });
    state = wikiTreeReducer(state, {
      type: "project",
      mutation: {
        token: "rename-2",
        type: "upsert",
        page: { ...pages[0], title: "Second" },
      },
    });

    state = wikiTreeReducer(state, {
      type: "confirm",
      token: "rename-2",
      page: { id: "root", title: "Second confirmed" },
    });

    expect(
      projectWikiTreePages(state).find((page) => page.id === "root")?.title,
    ).toBe("Second confirmed");

    state = wikiTreeReducer(state, {
      type: "confirm",
      token: "rename-1",
      page: { id: "root", title: "First confirmed" },
    });
    expect(
      projectWikiTreePages(state).find((page) => page.id === "root")?.title,
    ).toBe("Second confirmed");
  });

  it("rolls back only the failed mutation to the last confirmed tree", () => {
    let state = createWikiTreeState(pages);
    state = wikiTreeReducer(state, {
      type: "project",
      mutation: {
        token: "failed",
        type: "upsert",
        page: { ...pages[1], parentId: null },
      },
    });
    state = wikiTreeReducer(state, { type: "rollback", token: "failed" });

    expect(projectWikiTreePages(state)).toEqual(pages);
  });

  it("deletes the selected branch including descendants and can roll it back", () => {
    let state = createWikiTreeState(pages);
    state = wikiTreeReducer(state, {
      type: "project",
      mutation: { token: "delete-1", type: "delete", pageId: "child" },
    });
    expect(projectWikiTreePages(state).map((page) => page.id)).toEqual([
      "root",
    ]);

    state = wikiTreeReducer(state, { type: "rollback", token: "delete-1" });
    expect(projectWikiTreePages(state)).toEqual(pages);
  });

  it("projects, confirms, and rolls back sibling reorders", () => {
    const sibling = {
      id: "sibling",
      title: "Sibling",
      icon: null,
      parentId: "root",
      sortOrder: 2,
    };
    const initialPages = [...pages, sibling];
    const reordered = reorderWikiTreeSiblings(initialPages, "sibling", {
      direction: "up",
    });
    expect(reordered?.map((page) => page.id)).toEqual(["sibling", "child"]);
    let state = createWikiTreeState(initialPages);

    state = wikiTreeReducer(state, {
      type: "project",
      mutation: {
        token: "reorder-1",
        type: "reorder",
        siblings: reordered!,
      },
    });
    expect(projectWikiTreePages(state).map((page) => page.id)).toEqual([
      "root",
      "sibling",
      "grandchild",
      "child",
    ]);

    state = wikiTreeReducer(state, { type: "rollback", token: "reorder-1" });
    expect(projectWikiTreePages(state)).toEqual(initialPages);

    state = wikiTreeReducer(state, {
      type: "project",
      mutation: {
        token: "reorder-2",
        type: "reorder",
        siblings: reordered!,
      },
    });
    state = wikiTreeReducer(state, { type: "confirm", token: "reorder-2" });
    expect(state.pending).toHaveLength(0);
    expect(projectWikiTreePages(state).map((page) => page.id)).toEqual([
      "root",
      "sibling",
      "grandchild",
      "child",
    ]);
  });
});
