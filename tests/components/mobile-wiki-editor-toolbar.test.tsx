/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  blockPath: null as number[] | null,
  blockType: "p",
  canCreateDiscussion: true,
  openFilePicker: vi.fn(),
  selection: null as {
    anchor: { path: number[]; offset: number };
    focus: { path: number[]; offset: number };
  } | null,
  visualViewportBottomInset: 24,
}));

const editor = {
  api: {
    block: vi.fn(() =>
      mocks.blockPath
        ? [
            { type: mocks.blockType, children: [{ text: "Body" }] },
            mocks.blockPath,
          ]
        : null,
    ),
    create: { block: vi.fn(() => ({ type: "p", children: [{ text: "" }] })) },
    end: vi.fn(() => null),
    hasMark: vi.fn(() => false),
    node: vi.fn((path: number[]) =>
      mocks.blockPath && path.join(".") === mocks.blockPath.join(".")
        ? [{ type: mocks.blockType, children: [{ text: "Body" }] }, path]
        : null,
    ),
    pathRef: vi.fn((path: number[]) => ({ current: path, unref: vi.fn() })),
    start: vi.fn(() => null),
    toDOMRange: vi.fn(() => null),
    toSlateRange: vi.fn(() => null),
  },
  children: [{ type: "p", children: [{ text: "" }] }],
  getTransforms: vi.fn(() => ({ comment: { setDraft: vi.fn() } })),
  selection: null as typeof mocks.selection,
  tf: {
    blur: vi.fn(),
    deselect: vi.fn(),
    focus: vi.fn(),
    insertNodes: vi.fn(),
    removeNodes: vi.fn(),
    select: vi.fn(),
    toggleMark: vi.fn(),
    withoutNormalizing: vi.fn((run: () => void) => run()),
  },
  undo: vi.fn(),
};

vi.mock("platejs/react", () => ({
  useEditorRef: () => editor,
  useEditorSelection: () => mocks.selection,
}));

vi.mock("@/components/wiki/discussion-context", () => ({
  useDiscussions: () => ({
    activeCommentId: null,
    canCreateDiscussion: mocks.canCreateDiscussion,
    setActiveCommentId: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-visual-viewport", () => ({
  useVisualViewport: () => ({
    bottomInset: mocks.visualViewportBottomInset,
  }),
}));

vi.mock("use-file-picker", () => ({
  useFilePicker: () => ({ openFilePicker: mocks.openFilePicker }),
}));

vi.mock("@platejs/link/react", () => ({
  triggerFloatingLink: vi.fn(),
}));

vi.mock("@/components/editor/plugins/wiki-link-kit", () => ({
  openWikiLinkCombobox: vi.fn(),
}));

import { MobileWikiEditorToolbar } from "@/components/wiki/mobile-wiki-editor-toolbar";

function renderToolbar(visible = true) {
  return render(
    <MobileWikiEditorToolbar
      visible={visible}
      onDismiss={vi.fn()}
      onFileDialogChange={vi.fn()}
    />,
  );
}

describe("MobileWikiEditorToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blockPath = null;
    mocks.blockType = "p";
    mocks.canCreateDiscussion = true;
    mocks.selection = null;
    mocks.visualViewportBottomInset = 24;
    editor.selection = null;
    window.history.replaceState(null, "", "/wiki/test");
  });

  afterEach(cleanup);

  it("stays absent until the editor owns mobile focus", () => {
    renderToolbar(false);
    expect(
      screen.queryByRole("toolbar", { name: "键盘上方编辑工具" }),
    ).toBeNull();
  });

  it("renders one complete default action strip at the visual viewport inset", () => {
    renderToolbar();

    const toolbar = screen.getByRole("toolbar", {
      name: "键盘上方编辑工具",
    });
    expect(toolbar.style.bottom).toContain("24px");
    expect(toolbar.className).toContain("dark:bg-[#252525]");
    for (const name of [
      "插入块",
      "转换块类型",
      "提及页面",
      "添加批注",
      "插入图片",
      "删除当前块",
      "收起键盘",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(
      screen.getAllByRole("toolbar", { name: "键盘上方编辑工具" }),
    ).toHaveLength(1);
  });

  it("replaces default actions with inline formatting for an expanded selection", () => {
    mocks.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 2 },
    };
    editor.selection = mocks.selection;
    renderToolbar();

    for (const name of ["粗体", "斜体", "链接", "行内代码", "更多格式"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "插入块" })).toBeNull();
    expect(screen.getByRole("button", { name: "收起键盘" })).toBeTruthy();
  });

  it("exposes the full Insert catalog without a server or database", () => {
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "插入块" }));

    const dialog = screen.getByRole("dialog", { name: "插入块" });
    expect(dialog.className).toContain("fixed inset-0");
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByText("基础块")).toBeTruthy();
    expect(screen.getByText("丰富内容")).toBeTruthy();
    expect(screen.getByText("提示框")).toBeTruthy();
    expect(screen.getAllByTestId("mobile-insert-cell")).toHaveLength(19);
  });

  it("opens the Turn into catalog and marks the current block type", () => {
    mocks.blockPath = [0];
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "转换块类型" }));

    const dialog = screen.getByRole("dialog", { name: "Turn into" });
    expect(dialog.className).toContain("fixed inset-0");
    expect(screen.getAllByTestId("mobile-turn-into-cell")).toHaveLength(10);
    expect(
      screen.getByRole("button", { name: "正文", pressed: true }),
    ).toBeTruthy();
  });

  it("disables discussion creation without hiding the other editor actions", () => {
    mocks.canCreateDiscussion = false;
    renderToolbar();

    expect(
      (screen.getByRole("button", { name: "添加批注" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "插入图片" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
