import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDiscussions: vi.fn(),
  getOwnWikiDraft: vi.fn(),
  getWikiPageForEdit: vi.fn(),
  getWikiTree: vi.fn(),
  updateWikiPage: vi.fn(),
}));

vi.mock("@/lib/discussion-actions", () => ({
  getDiscussions: mocks.getDiscussions,
}));

vi.mock("@/lib/wiki-actions", () => ({
  deleteWikiPage: vi.fn(),
  getWikiPageForEdit: mocks.getWikiPageForEdit,
  getWikiTree: mocks.getWikiTree,
  updateWikiPage: mocks.updateWikiPage,
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
import { fingerprintWikiPageSubmission } from "@/lib/wiki-page-submission";

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

  it("returns the committed update when post-commit tree projection refresh fails", async () => {
    const hiddenChildLink = {
      type: "p",
      children: [
        {
          type: "a",
          pageId: CHILD_ID,
          url: `/wiki/${CHILD_ID}`,
          children: [{ text: "Child" }],
        },
      ],
    };
    const editorContent = JSON.stringify([
      { type: "p", children: [{ text: "Committed" }] },
    ]);
    const initialPage = page({
      content: JSON.stringify([hiddenChildLink]),
    });
    const committed = page({
      title: "Committed",
      content: JSON.stringify([hiddenChildLink, ...JSON.parse(editorContent)]),
      version: 5,
    });
    mocks.getWikiPageForEdit.mockResolvedValue(initialPage);
    mocks.updateWikiPage.mockResolvedValue(committed);
    mocks.getWikiTree.mockRejectedValue(new Error("tree refresh unavailable"));

    const element = await WikiPageEditor({
      page: initialPage,
      pages: [],
      userId: "user-1",
    });
    const submit = element.props.onSubmit as (
      data: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;

    await expect(
      submit({
        title: "Committed",
        icon: null,
        content: editorContent,
        submissionId: "00000000-0000-4000-8000-000000000431",
        parentId: null,
        expectedVersion: 4,
        expectedContentGeneration: 0,
        expectedUpdatedAt: initialPage.updatedAt.toISOString(),
        baseTitle: initialPage.title,
        baseIcon: initialPage.icon,
        baseContent: editorContent,
        baseParentId: initialPage.parentId,
        hiddenChildPageIds: [CHILD_ID],
      }),
    ).resolves.toMatchObject({
      title: "Committed",
      version: 5,
      content: editorContent,
      hiddenChildPageIds: [CHILD_ID],
    });
  });

  it("binds submission identity before restoring hidden child-link projection", async () => {
    const hiddenChildLink = {
      type: "p",
      children: [
        {
          type: "a",
          pageId: CHILD_ID,
          url: `/wiki/${CHILD_ID}`,
          children: [{ text: "Child" }],
        },
      ],
    };
    const initialPage = page({
      content: JSON.stringify([
        hiddenChildLink,
        { type: "p", children: [{ text: "Initial" }] },
      ]),
    });
    const editorContent = JSON.stringify([
      { type: "p", children: [{ text: "Submitted" }] },
    ]);
    const submission = {
      title: "Submitted",
      icon: null,
      content: editorContent,
      editSummary: "summary",
      submissionId: "00000000-0000-4000-8000-000000000432",
      parentId: null,
      expectedVersion: 4,
      expectedContentGeneration: 0,
      expectedUpdatedAt: initialPage.updatedAt.toISOString(),
      baseTitle: initialPage.title,
      baseIcon: initialPage.icon,
      baseContent: editorContent,
      baseParentId: initialPage.parentId,
      hiddenChildPageIds: [CHILD_ID],
    };
    mocks.getWikiPageForEdit.mockResolvedValue(initialPage);
    mocks.updateWikiPage.mockResolvedValue(page({ version: 5 }));
    mocks.getWikiTree.mockResolvedValue([]);

    const element = await WikiPageEditor({
      page: initialPage,
      pages: [
        {
          id: PAGE_ID,
          title: "Parent",
          icon: null,
          parentId: null,
          sortOrder: 0,
        },
        {
          id: CHILD_ID,
          title: "Child",
          icon: null,
          parentId: PAGE_ID,
          sortOrder: 0,
        },
      ],
      userId: "user-1",
    });
    const submit = element.props.onSubmit as (
      data: typeof submission,
    ) => Promise<unknown>;

    await submit(submission);

    expect(mocks.updateWikiPage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(CHILD_ID),
      }),
      {
        submissionPayload: {
          pageId: PAGE_ID,
          ...submission,
        },
      },
    );
    expect(
      fingerprintWikiPageSubmission(
        mocks.updateWikiPage.mock.calls[0][1].submissionPayload,
      ),
    ).toBe(fingerprintWikiPageSubmission({ pageId: PAGE_ID, ...submission }));
  });

  it("restores links hidden by the submitted editor baseline instead of the mount-time tree", async () => {
    const hiddenChildLink = {
      type: "p",
      children: [
        {
          type: "a",
          pageId: CHILD_ID,
          url: `/wiki/${CHILD_ID}`,
          children: [{ text: "Child" }],
        },
      ],
    };
    const stored = page({
      content: JSON.stringify([
        hiddenChildLink,
        { type: "p", children: [{ text: "Initial" }] },
      ]),
    });
    const submittedContent = JSON.stringify([
      { type: "p", children: [{ text: "Submitted" }] },
    ]);
    mocks.getWikiPageForEdit.mockResolvedValue(stored);
    mocks.updateWikiPage.mockResolvedValue(
      page({ content: stored.content, version: 5 }),
    );
    mocks.getWikiTree.mockResolvedValue([
      {
        id: CHILD_ID,
        title: "Child",
        icon: null,
        parentId: PAGE_ID,
        sortOrder: 0,
      },
    ]);

    const element = await WikiPageEditor({
      page: stored,
      // The link was visible when this editor mounted. A later authoritative
      // response hid it after the target became a child.
      pages: [],
      userId: "user-1",
    });
    const submit = element.props.onSubmit as (
      data: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;

    const result = await submit({
      title: "Submitted",
      icon: null,
      content: submittedContent,
      submissionId: "00000000-0000-4000-8000-000000000433",
      hiddenChildPageIds: [CHILD_ID],
      parentId: null,
      expectedVersion: 4,
      expectedContentGeneration: 0,
      expectedUpdatedAt: stored.updatedAt.toISOString(),
      baseTitle: stored.title,
      baseIcon: stored.icon,
      baseContent: submittedContent,
      baseParentId: stored.parentId,
    });

    expect(mocks.updateWikiPage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(CHILD_ID),
      }),
      expect.any(Object),
    );
    expect(result).toMatchObject({ hiddenChildPageIds: [CHILD_ID] });
  });

  it("keeps a rejected conflict classified when tree projection refresh fails", async () => {
    const initialPage = page();
    mocks.getWikiPageForEdit.mockResolvedValue(initialPage);
    mocks.updateWikiPage.mockResolvedValue({
      conflict: true,
      theirContent: initialPage.content,
      theirTitle: "Server title",
      theirIcon: null,
      theirParentId: null,
      theirVersion: 5,
      theirContentGeneration: 0,
      theirUpdatedAt: "2026-01-01T00:00:01.000Z",
    });
    mocks.getWikiTree.mockRejectedValue(new Error("tree refresh unavailable"));

    const element = await WikiPageEditor({
      page: initialPage,
      pages: [],
      userId: "user-1",
    });
    const submit = element.props.onSubmit as (
      data: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;

    await expect(
      submit({
        title: "Local title",
        icon: null,
        content: initialPage.content,
        submissionId: "00000000-0000-4000-8000-000000000434",
        parentId: initialPage.parentId,
        expectedVersion: 4,
        expectedContentGeneration: 0,
        expectedUpdatedAt: initialPage.updatedAt.toISOString(),
        baseTitle: initialPage.title,
        baseIcon: initialPage.icon,
        baseContent: initialPage.content,
        baseParentId: initialPage.parentId,
        hiddenChildPageIds: [],
      }),
    ).resolves.toMatchObject({
      conflict: true,
      theirTitle: "Server title",
      theirVersion: 5,
    });
  });

  it("returns a known rejection when the mutation itself fails", async () => {
    const initialPage = page();
    mocks.getWikiPageForEdit.mockResolvedValue(initialPage);
    mocks.updateWikiPage.mockRejectedValue(new Error("mutation rejected"));

    const element = await WikiPageEditor({
      page: initialPage,
      pages: [],
      userId: "user-1",
    });
    const submit = element.props.onSubmit as (
      data: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;

    await expect(
      submit({
        title: initialPage.title,
        icon: initialPage.icon,
        content: initialPage.content,
        submissionId: "00000000-0000-4000-8000-000000000435",
        parentId: initialPage.parentId,
        expectedVersion: 4,
        expectedContentGeneration: 0,
        expectedUpdatedAt: initialPage.updatedAt.toISOString(),
        baseTitle: initialPage.title,
        baseIcon: initialPage.icon,
        baseContent: initialPage.content,
        baseParentId: initialPage.parentId,
        hiddenChildPageIds: [],
      }),
    ).resolves.toEqual({ error: "mutation rejected" });
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
