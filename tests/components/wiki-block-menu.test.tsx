/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canCreateDiscussion: true,
  setActiveCommentId: vi.fn(),
  setBlockSelection: vi.fn(),
  clearBlockSelection: vi.fn(),
  setDraftComment: vi.fn(),
  toast: vi.fn(),
}));

const editor = {
  api: {
    create: { block: vi.fn(() => ({ type: "p", children: [{ text: "" }] })) },
    end: vi.fn(() => ({ path: [0, 0], offset: 4 })),
    node: vi.fn((path: number[]) => [
      { id: `block-${path[0]}`, type: "p", children: [{ text: "Body" }] },
      path,
    ]),
    pointRef: vi.fn((point: unknown) => ({ unref: vi.fn(() => point) })),
    start: vi.fn(() => ({ path: [0, 0], offset: 0 })),
  },
  children: [
    { id: "block-0", type: "p", children: [{ text: "One" }] },
    { id: "block-1", type: "p", children: [{ text: "Two" }] },
    { id: "block-2", type: "p", children: [{ text: "Three" }] },
  ],
  getApi: vi.fn(() => ({
    blockSelection: {
      clear: mocks.clearBlockSelection,
      set: mocks.setBlockSelection,
    },
  })),
  getTransforms: vi.fn(() => ({
    comment: { setDraft: mocks.setDraftComment },
  })),
  tf: {
    deselect: vi.fn(),
    duplicateNodes: vi.fn(),
    focus: vi.fn(),
    insertNodes: vi.fn(),
    moveNodes: vi.fn(),
    removeNodes: vi.fn(),
    select: vi.fn(),
    setNodes: vi.fn(),
    unsetNodes: vi.fn(),
    withoutNormalizing: vi.fn((run: () => void) => run()),
  },
  undo: vi.fn(),
};

vi.mock("platejs/react", () => ({ useEditorRef: () => editor }));

vi.mock("@/components/wiki/discussion-context", () => ({
  useDiscussions: () => ({
    canCreateDiscussion: mocks.canCreateDiscussion,
    setActiveCommentId: mocks.setActiveCommentId,
  }),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import {
  WIKI_OPEN_BLOCK_MENU_EVENT,
  type WikiOpenBlockMenuDetail,
} from "@/components/editor/block-menu-events";
import { WikiBlockMenu } from "@/components/ui/wiki-block-menu";

function renderMenu(path = [1]) {
  return render(
    <WikiBlockMenu
      dragHandleRef={vi.fn()}
      element={editor.children[path[0]]}
      keyboardEnabled
      path={path}
    />,
  );
}

function openMenu(blockId = "block-1") {
  act(() => {
    window.dispatchEvent(
      new CustomEvent<WikiOpenBlockMenuDetail>(WIKI_OPEN_BLOCK_MENU_EVENT, {
        detail: { blockId },
      }),
    );
  });
}

describe("WikiBlockMenu local block actions (#203)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canCreateDiscussion = true;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("filters the action catalog without a server or database", () => {
    renderMenu();
    openMenu();

    const search = screen.getByRole("searchbox", { name: "搜索块操作" });
    fireEvent.change(search, { target: { value: "删除" } });
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "复制" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "转换为" })).toBeNull();

    fireEvent.change(search, { target: { value: "标题" } });
    expect(screen.getByRole("menuitem", { name: "转换为" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "删除" })).toBeNull();
  });

  it("duplicates the targeted block and selects the copy", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "复制" }));

    expect(editor.tf.duplicateNodes).toHaveBeenCalledWith({
      at: [1],
      block: true,
    });
    expect(mocks.setBlockSelection).toHaveBeenLastCalledWith("block-2");
  });

  it("moves the targeted block relative to its siblings", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "下移" }));

    expect(editor.tf.moveNodes).toHaveBeenCalledWith({ at: [1], to: [3] });
  });

  it("converts the targeted paragraph to Heading 2", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "转换为" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "标题 2" }));

    expect(editor.tf.setNodes).toHaveBeenCalledWith(
      { type: "h2" },
      { at: [1] },
    );
  });

  it("disables moves that would cross the document boundary", () => {
    renderMenu([0]);
    openMenu("block-0");
    expect(
      screen
        .getByRole("menuitem", { name: "上移" })
        .getAttribute("aria-disabled"),
    ).toBe("true");

    cleanup();
    renderMenu([2]);
    openMenu("block-2");
    expect(
      screen
        .getByRole("menuitem", { name: "下移" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("starts a whole-block discussion only when allowed", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "批注" }));

    expect(mocks.setDraftComment).toHaveBeenCalledWith({ at: [1] });
    expect(mocks.clearBlockSelection).toHaveBeenCalled();
    expect(mocks.setActiveCommentId).toHaveBeenCalledWith("draft");

    cleanup();
    mocks.canCreateDiscussion = false;
    renderMenu();
    openMenu();
    expect(screen.queryByRole("menuitem", { name: "批注" })).toBeNull();
  });

  it("deletes the targeted block and exposes an undo action", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));

    expect(editor.tf.removeNodes).toHaveBeenCalledWith({ at: [1] });
    expect(mocks.toast).toHaveBeenCalledWith(
      "已删除块",
      expect.objectContaining({
        action: expect.objectContaining({ label: "撤销" }),
      }),
    );

    const options = mocks.toast.mock.calls[0][1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();
    expect(editor.undo).toHaveBeenCalled();
  });
});
