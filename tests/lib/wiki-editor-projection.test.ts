import { describe, expect, it } from "vitest";

import {
  normalizeWikiEditorHiddenChildPageIds,
  restoreWikiEditorContentProjection,
  toWikiEditorValue,
} from "@/lib/wiki-editor-projection";

const CHILD_ONE = "11111111-1111-4111-8111-111111111111";
const CHILD_TWO = "22222222-2222-4222-8222-222222222222";

const childLink = {
  type: "p",
  children: [
    {
      type: "a",
      pageId: CHILD_ONE,
      url: "/wiki/stale",
      children: [{ text: "Child page" }],
    },
  ],
};
const body = { type: "p", children: [{ text: "Edited body" }] };
const restoredChildLink = {
  ...childLink,
  id: "wiki-projection-0",
  children: [
    {
      ...childLink.children[0],
      id: "wiki-projection-0-0",
    },
  ],
};

describe("wiki editor projection", () => {
  it("validates, deduplicates, and sorts hidden child identities", () => {
    expect(
      normalizeWikiEditorHiddenChildPageIds([CHILD_TWO, CHILD_ONE, CHILD_TWO]),
    ).toEqual([CHILD_ONE, CHILD_TWO]);

    expect(() =>
      normalizeWikiEditorHiddenChildPageIds(["not-a-page-id"]),
    ).toThrow("Invalid editor projection");
    expect(() => normalizeWikiEditorHiddenChildPageIds(null)).toThrow(
      "Invalid editor projection",
    );
  });

  it("hides only the standalone links in the supplied causal projection", () => {
    expect(
      toWikiEditorValue(
        {
          title: "Parent",
          content: JSON.stringify([childLink, body]),
        },
        [CHILD_ONE],
      ),
    ).toEqual([body]);

    expect(
      toWikiEditorValue(
        {
          title: "Parent",
          content: JSON.stringify([childLink, body]),
        },
        [],
      ),
    ).toEqual([
      {
        ...childLink,
        children: [
          {
            ...childLink.children[0],
            url: `/wiki/${CHILD_ONE}`,
          },
        ],
      },
      body,
    ]);
  });

  it("restores hidden stored links but honors deletion of visible links", () => {
    const storedContent = JSON.stringify([childLink, body]);
    const editorContent = JSON.stringify([body]);

    expect(
      JSON.parse(
        restoreWikiEditorContentProjection(storedContent, editorContent, [
          CHILD_ONE,
        ]),
      ),
    ).toEqual([restoredChildLink, body]);
    expect(
      JSON.parse(
        restoreWikiEditorContentProjection(storedContent, editorContent, []),
      ),
    ).toEqual([body]);
  });

  it("assigns stable unique identities to restored legacy elements", () => {
    const identifiedBody = { ...body, id: "body" };
    const storedContent = JSON.stringify([childLink, body]);
    const editorContent = JSON.stringify([identifiedBody]);

    const first = JSON.parse(
      restoreWikiEditorContentProjection(storedContent, editorContent, [
        CHILD_ONE,
      ]),
    );
    const second = JSON.parse(
      restoreWikiEditorContentProjection(storedContent, editorContent, [
        CHILD_ONE,
      ]),
    );

    expect(first).toEqual(second);
    expect(first).toEqual([restoredChildLink, identifiedBody]);
    expect(
      new Set([first[0].id, first[0].children[0].id, first[1].id]).size,
    ).toBe(3);
  });

  it("does not collide with an existing editor identity", () => {
    const collidingBody = { ...body, id: "wiki-projection-0" };

    expect(
      JSON.parse(
        restoreWikiEditorContentProjection(
          JSON.stringify([childLink, body]),
          JSON.stringify([collidingBody]),
          [CHILD_ONE],
        ),
      ),
    ).toEqual([
      {
        ...childLink,
        id: "wiki-projection-0-1",
        children: [
          {
            ...childLink.children[0],
            id: "wiki-projection-0-0",
          },
        ],
      },
      collidingBody,
    ]);
  });
});
