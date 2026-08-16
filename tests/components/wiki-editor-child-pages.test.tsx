/**
 * @vitest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WikiEditorChildPages } from "@/components/wiki/wiki-editor-child-pages";
import { WikiTreeProvider } from "@/components/wiki/wiki-tree-provider";
import type { WikiTreePage } from "@/lib/wiki-tree-state";

const PARENT_ID = "parent";
const DINING_ID = "dining";
const MOVABLE_ID = "movable";
const DRAFT_ID = "draft";

function treePages(order: [string, string]): WikiTreePage[] {
  const titles = new Map([
    [DINING_ID, "Dining on Campus"],
    [MOVABLE_ID, "Movable Campus Child"],
  ]);
  return [
    {
      id: PARENT_ID,
      title: "Campus Life",
      icon: null,
      parentId: null,
      sortOrder: 0,
    },
    ...order.map((id, sortOrder) => ({
      id,
      title: titles.get(id)!,
      icon: null,
      parentId: PARENT_ID,
      sortOrder,
    })),
  ];
}

function Harness({ pages }: { pages: WikiTreePage[] }) {
  return (
    <WikiTreeProvider initialPages={pages}>
      <WikiEditorChildPages
        pageId={PARENT_ID}
        fallbackPages={[
          { id: DINING_ID, title: "stale Dining" },
          { id: MOVABLE_ID, title: "stale Movable" },
        ]}
      />
    </WikiTreeProvider>
  );
}

describe("WikiEditorChildPages", () => {
  it("follows the hydrated shared tree after a sibling reorder", async () => {
    const { rerender } = render(
      <Harness pages={treePages([DINING_ID, MOVABLE_ID])} />,
    );

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["Dining on Campus", "Movable Campus Child"],
    );

    await act(async () => {
      rerender(<Harness pages={treePages([MOVABLE_ID, DINING_ID])} />);
    });

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["Movable Campus Child", "Dining on Campus"],
    );
  });

  it("does not expose a private draft from the shared navigation tree", () => {
    render(
      <Harness
        pages={[
          ...treePages([DINING_ID, MOVABLE_ID]),
          {
            id: DRAFT_ID,
            title: "Private draft child",
            icon: null,
            parentId: PARENT_ID,
            sortOrder: 2,
          },
        ]}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Private draft child" }),
    ).toBeNull();
  });
});
