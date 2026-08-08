import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDiscussions: vi.fn(),
  getOwnWikiDraft: vi.fn(),
  getWikiPageForEdit: vi.fn(),
  getWikiTree: vi.fn(),
}));

vi.mock("@/lib/discussion-actions", () => ({
  getDiscussions: mocks.getDiscussions,
}));

vi.mock("@/lib/wiki-actions", () => ({
  deleteWikiPage: vi.fn(),
  getWikiPageForEdit: mocks.getWikiPageForEdit,
  getWikiTree: mocks.getWikiTree,
  updateWikiPage: vi.fn(),
}));

vi.mock("@/lib/wiki-draft-actions", () => ({
  createWikiDraft: vi.fn(),
  deleteWikiDraft: vi.fn(),
  getOwnWikiDraft: mocks.getOwnWikiDraft,
  publishWikiDraft: vi.fn(),
  updateWikiDraft: vi.fn(),
}));

vi.mock("@/components/wiki/wiki-editor-lazy", () => ({
  WikiEditorLazy: () => null,
}));

import {
  WikiDraftPageEditor,
  WikiPageEditor,
} from "@/components/wiki/wiki-page-editor";

const PAGE_ID = "00000000-0000-4000-a000-000000000001";
const CHILD_ID = "00000000-0000-4000-a000-000000000002";
const OTHER_PARENT_ID = "00000000-0000-4000-a000-000000000003";

function page(
  overrides: Partial<{
    id: string;
    title: string;
    content: string;
    parentId: string | null;
    version: number;
  }> = {},
) {
  return {
    id: PAGE_ID,
    title: "Parent",
    icon: null,
    content: JSON.stringify([{ type: "p", children: [{ text: "Initial" }] }]),
    parentId: null,
    sortOrder: 0,
    deletedAt: null,
    createdBy: "00000000-0000-4000-a000-000000000010",
    updatedBy: "00000000-0000-4000-a000-000000000010",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    version: 4,
    contentGeneration: 0,
    ...overrides,
  };
}

describe("WikiPageEditor update checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDiscussions.mockResolvedValue([]);
  });

  it("normalizes a remote Page with the current tree instead of the render-time children", async () => {
    const initialPage = page();
    const initialTree = [
      {
        id: PAGE_ID,
        title: "Parent",
        icon: null,
        parentId: null,
        sortOrder: 0,
      },
      {
        id: CHILD_ID,
        title: "Moved page",
        icon: null,
        parentId: PAGE_ID,
        sortOrder: 0,
      },
    ];
    const link = {
      type: "p",
      children: [
        {
          type: "a",
          pageId: CHILD_ID,
          url: `/wiki/${CHILD_ID}`,
          children: [{ text: "Moved page" }],
        },
      ],
    };
    mocks.getWikiPageForEdit.mockResolvedValue(
      page({
        content: JSON.stringify([link]),
        version: 5,
      }),
    );
    mocks.getWikiTree.mockResolvedValue([
      initialTree[0],
      { ...initialTree[1], parentId: OTHER_PARENT_ID },
    ]);

    const element = await WikiPageEditor({
      page: initialPage,
      pages: initialTree,
      userId: "user-1",
    });
    const checkForUpdate = element.props.onCheckForUpdate as (
      currentVersion: number,
    ) => Promise<{ content: string } | null>;

    const update = await checkForUpdate(4);

    expect(mocks.getWikiTree).toHaveBeenCalledOnce();
    expect(JSON.parse(update!.content)).toEqual([link]);
  });

  it("does not fetch the tree or replace editor state when the version is unchanged", async () => {
    const initialPage = page();
    mocks.getWikiPageForEdit.mockResolvedValue(page({ version: 4 }));

    const element = await WikiPageEditor({
      page: initialPage,
      pages: [],
      userId: "user-1",
    });
    const checkForUpdate = element.props.onCheckForUpdate as (
      currentVersion: number,
    ) => Promise<unknown>;

    await expect(checkForUpdate(4)).resolves.toBeNull();
    expect(mocks.getWikiTree).not.toHaveBeenCalled();
  });

  it("exposes the latest private draft revision to a passive editor", async () => {
    const initialDraft = {
      id: PAGE_ID,
      title: "Draft v4",
      icon: null,
      content: JSON.stringify([
        { type: "p", children: [{ text: "Draft v4" }] },
      ]),
      parentId: null,
      createdBy: "user-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      version: 4,
    };
    mocks.getOwnWikiDraft.mockResolvedValue({
      ...initialDraft,
      title: "Draft v5",
      content: JSON.stringify([
        { type: "p", children: [{ text: "Draft v5" }] },
      ]),
      updatedAt: new Date("2026-01-01T00:00:01.000Z"),
      version: 5,
    });

    const element = WikiDraftPageEditor({
      pageId: PAGE_ID,
      parentId: null,
      draft: initialDraft,
      pages: [],
      userId: "user-1",
    });
    const checkForUpdate = element.props.onCheckForUpdate as
      | ((currentVersion: number) => Promise<{ title?: string } | null>)
      | undefined;

    expect(checkForUpdate).toEqual(expect.any(Function));
    await expect(checkForUpdate!(4)).resolves.toMatchObject({
      title: "Draft v5",
      version: 5,
      contentGeneration: 0,
    });
  });
});
