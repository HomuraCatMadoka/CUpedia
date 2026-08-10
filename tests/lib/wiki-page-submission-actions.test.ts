import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  page: { findFirst: vi.fn() },
  receipt: { findFirst: vi.fn() },
  mergeContent: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      wikiPages: mocks.page,
      wikiPageSubmissionReceipts: mocks.receipt,
      wikiRevisions: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    transaction: (run: (tx: unknown) => unknown) => mocks.transaction(run),
  },
}));

vi.mock("@/db/schema", () => ({
  wikiPages: {
    id: "page.id",
    title: "page.title",
    content: "page.content",
    createdBy: "page.createdBy",
    deletedAt: "page.deletedAt",
    parentId: "page.parentId",
    sortOrder: "page.sortOrder",
    updatedAt: "page.updatedAt",
    version: "page.version",
    contentGeneration: "page.contentGeneration",
  },
  wikiRevisions: {
    id: "revision.id",
    pageId: "revision.pageId",
    editedBy: "revision.editedBy",
    createdAt: "revision.createdAt",
    editSummary: "revision.editSummary",
  },
  wikiPageSubmissionReceipts: {
    id: "receipt.id",
    pageId: "receipt.pageId",
    submittedBy: "receipt.submittedBy",
  },
  wikiLinks: {
    sourceId: "link.sourceId",
    targetId: "link.targetId",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
  revalidateTag: (...args: unknown[]) => mocks.revalidateTag(...args),
  updateTag: (...args: unknown[]) => mocks.updateTag(...args),
  unstable_cache: (loader: (...args: unknown[]) => unknown) => loader,
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
  requireEditor: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("@/lib/contributor-account", () => ({
  assertContributorComplete: vi.fn(async (user) => user),
}));

vi.mock("@/lib/merge-content", () => ({
  threeWayMergeContent: (...args: unknown[]) => mocks.mergeContent(...args),
}));

import { updateWikiPage } from "@/lib/wiki-actions";
import { fingerprintWikiPageSubmission } from "@/lib/wiki-page-submission";

const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const SUBMISSION_ID = "00000000-0000-4000-8000-000000000432";
const PARENT_ID = "00000000-0000-4000-8000-000000000099";
const CONTENT = JSON.stringify([
  { type: "p", children: [{ text: "Submitted" }] },
]);
const BASE_CONTENT = JSON.stringify([
  { type: "p", children: [{ text: "Base" }] },
]);
const HIDDEN_CHILD_CONTENT = JSON.stringify([
  {
    type: "p",
    children: [
      {
        type: "a",
        pageId: PARENT_ID,
        url: `/wiki/${PARENT_ID}`,
        children: [{ text: "Former child" }],
      },
    ],
  },
  ...JSON.parse(CONTENT),
]);
const SUBMISSION = {
  pageId: PAGE_ID,
  title: "Submitted",
  icon: null,
  content: CONTENT,
  editSummary: "summary",
  submissionId: SUBMISSION_ID,
  parentId: null,
  expectedVersion: 1,
  expectedContentGeneration: 0,
  expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
  baseTitle: "Base",
  baseIcon: null,
  baseContent: BASE_CONTENT,
  baseParentId: null,
};

function page(overrides: Record<string, unknown> = {}) {
  return {
    id: PAGE_ID,
    title: "Base",
    icon: null,
    content: BASE_CONTENT,
    parentId: null,
    sortOrder: 0,
    deletedAt: null,
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    version: 1,
    contentGeneration: 0,
    ...overrides,
  };
}

function writeTransaction(committed: ReturnType<typeof page>) {
  const inserted: unknown[] = [];
  let selectCount = 0;
  const tx = {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([committed]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn((value: unknown) => {
        inserted.push(value);
        return Promise.resolve();
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    select: vi.fn().mockImplementation(() => {
      selectCount += 1;
      if (selectCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      };
    }),
  };
  return { tx, inserted };
}

function conflictTransaction() {
  return {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.receipt.findFirst.mockResolvedValue(undefined);
});

describe("wiki Page submission receipts", () => {
  it("stores immutable identity and exact metadata without duplicating a direct write", async () => {
    const committed = page({
      title: "Submitted",
      content: CONTENT,
      updatedAt: new Date("2026-01-01T00:00:01.000Z"),
      version: 2,
    });
    mocks.page.findFirst.mockResolvedValueOnce(page());
    const { tx, inserted } = writeTransaction(committed);
    mocks.transaction.mockImplementation(async (run) => run(tx));

    await updateWikiPage(SUBMISSION);

    expect(inserted).toContainEqual(
      expect.objectContaining({
        id: SUBMISSION_ID,
        pageId: PAGE_ID,
        submittedBy: "user-1",
        requestFingerprint: fingerprintWikiPageSubmission(SUBMISSION),
        committedPageOverride: null,
        committedVersion: 2,
        committedContentGeneration: 0,
        committedUpdatedAt: new Date("2026-01-01T00:00:01.000Z"),
      }),
    );
  });

  it("replays the receipt's causal committed baseline instead of the newer current Page", async () => {
    const current = page({
      title: "Later writer",
      content: "later content",
      updatedAt: new Date("2026-01-01T00:00:02.000Z"),
      version: 3,
    });
    mocks.page.findFirst.mockResolvedValueOnce(current);
    mocks.receipt.findFirst.mockResolvedValueOnce({
      id: SUBMISSION_ID,
      pageId: PAGE_ID,
      submittedBy: "user-1",
      requestFingerprint: fingerprintWikiPageSubmission(SUBMISSION),
      committedPageOverride: null,
      committedVersion: 2,
      committedContentGeneration: 0,
      committedUpdatedAt: new Date("2026-01-01T00:00:01.000Z"),
    });

    await expect(updateWikiPage(SUBMISSION)).resolves.toMatchObject({
      title: "Submitted",
      content: CONTENT,
      version: 2,
      updatedAt: new Date("2026-01-01T00:00:01.000Z"),
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects reuse of a submission id with a changed payload", async () => {
    mocks.page.findFirst.mockResolvedValueOnce(page({ version: 2 }));
    mocks.receipt.findFirst.mockResolvedValueOnce({
      id: SUBMISSION_ID,
      pageId: PAGE_ID,
      submittedBy: "user-1",
      requestFingerprint: fingerprintWikiPageSubmission(SUBMISSION),
      committedPageOverride: null,
      committedVersion: 2,
      committedContentGeneration: 0,
      committedUpdatedAt: new Date("2026-01-01T00:00:01.000Z"),
    });

    await expect(
      updateWikiPage({ ...SUBMISSION, editSummary: "changed summary" }),
    ).rejects.toThrow("SUBMISSION_ID_CONFLICT");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("stores only fields changed by a clean merge for exact replay", async () => {
    const remoteContent = JSON.stringify([
      { type: "p", children: [{ text: "Remote" }] },
    ]);
    const mergedContent = JSON.stringify([
      { type: "p", children: [{ text: "Submitted" }] },
      { type: "p", children: [{ text: "Remote" }] },
    ]);
    const latest = page({
      content: remoteContent,
      updatedAt: new Date("2026-01-01T00:00:01.000Z"),
      version: 2,
    });
    const committed = page({
      title: "Submitted",
      content: mergedContent,
      updatedAt: new Date("2026-01-01T00:00:02.000Z"),
      version: 3,
    });
    mocks.page.findFirst
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(latest);
    mocks.mergeContent.mockResolvedValueOnce({
      clean: true,
      content: mergedContent,
    });
    const { tx, inserted } = writeTransaction(committed);
    mocks.transaction
      .mockImplementationOnce(async (run) => run(conflictTransaction()))
      .mockImplementationOnce(async (run) => run(tx));

    await updateWikiPage(SUBMISSION);

    expect(inserted).toContainEqual(
      expect.objectContaining({
        id: SUBMISSION_ID,
        requestFingerprint: fingerprintWikiPageSubmission(SUBMISSION),
        committedPageOverride: { content: mergedContent },
        committedVersion: 3,
        committedUpdatedAt: new Date("2026-01-01T00:00:02.000Z"),
      }),
    );
  });

  it("stores omitted scalar values that cannot be reconstructed from the request", async () => {
    const request = {
      ...SUBMISSION,
      icon: undefined,
      parentId: undefined,
    };
    const committed = page({
      title: "Submitted",
      icon: "🎓",
      content: CONTENT,
      parentId: PARENT_ID,
      updatedAt: new Date("2026-01-01T00:00:01.000Z"),
      version: 2,
    });
    mocks.page.findFirst.mockResolvedValueOnce(
      page({ icon: "🎓", parentId: PARENT_ID }),
    );
    const { tx, inserted } = writeTransaction(committed);
    mocks.transaction.mockImplementation(async (run) => run(tx));

    await updateWikiPage(request);

    expect(inserted).toContainEqual(
      expect.objectContaining({
        requestFingerprint: fingerprintWikiPageSubmission(request),
        committedPageOverride: { icon: "🎓", parentId: PARENT_ID },
      }),
    );
  });

  it("replays a clean merge override without adopting a still-newer Page", async () => {
    const mergedContent = JSON.stringify([
      { type: "p", children: [{ text: "Submitted" }] },
      { type: "p", children: [{ text: "Remote" }] },
    ]);
    mocks.page.findFirst.mockResolvedValueOnce(
      page({
        title: "Still newer",
        content: "newest content",
        updatedAt: new Date("2026-01-01T00:00:03.000Z"),
        version: 4,
      }),
    );
    mocks.receipt.findFirst.mockResolvedValueOnce({
      id: SUBMISSION_ID,
      pageId: PAGE_ID,
      submittedBy: "user-1",
      requestFingerprint: fingerprintWikiPageSubmission(SUBMISSION),
      committedPageOverride: { content: mergedContent },
      committedVersion: 3,
      committedContentGeneration: 0,
      committedUpdatedAt: new Date("2026-01-01T00:00:02.000Z"),
    });

    await expect(updateWikiPage(SUBMISSION)).resolves.toMatchObject({
      title: "Submitted",
      content: mergedContent,
      version: 3,
      updatedAt: new Date("2026-01-01T00:00:02.000Z"),
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("stores the committed storage projection when it differs from the logical payload", async () => {
    const committed = page({
      title: "Submitted",
      content: HIDDEN_CHILD_CONTENT,
      updatedAt: new Date("2026-01-01T00:00:01.000Z"),
      version: 2,
    });
    mocks.page.findFirst.mockResolvedValueOnce(page());
    const { tx, inserted } = writeTransaction(committed);
    mocks.transaction.mockImplementation(async (run) => run(tx));

    await updateWikiPage(
      { ...SUBMISSION, content: HIDDEN_CHILD_CONTENT },
      { submissionPayload: SUBMISSION },
    );

    expect(inserted).toContainEqual(
      expect.objectContaining({
        requestFingerprint: fingerprintWikiPageSubmission(SUBMISSION),
        committedPageOverride: { content: HIDDEN_CHILD_CONTENT },
      }),
    );
  });

  it("replays the original storage projection after the hidden child set changes", async () => {
    mocks.page.findFirst.mockResolvedValueOnce(
      page({
        title: "Later writer",
        content: "later content without the former child link",
        updatedAt: new Date("2026-01-01T00:00:02.000Z"),
        version: 3,
      }),
    );
    mocks.receipt.findFirst.mockResolvedValueOnce({
      id: SUBMISSION_ID,
      pageId: PAGE_ID,
      submittedBy: "user-1",
      requestFingerprint: fingerprintWikiPageSubmission(SUBMISSION),
      committedPageOverride: { content: HIDDEN_CHILD_CONTENT },
      committedVersion: 2,
      committedContentGeneration: 0,
      committedUpdatedAt: new Date("2026-01-01T00:00:01.000Z"),
    });

    await expect(
      updateWikiPage(SUBMISSION, { submissionPayload: SUBMISSION }),
    ).resolves.toMatchObject({
      content: HIDDEN_CHILD_CONTENT,
      version: 2,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("legacy unidentified Page retries", () => {
  it("treats an already-applied retry as success without another write", async () => {
    const latest = page({
      title: "Submitted",
      content: CONTENT,
      updatedAt: new Date("2026-01-01T00:00:01.000Z"),
      version: 2,
    });
    mocks.page.findFirst
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(latest);
    mocks.transaction.mockImplementation(async (run) =>
      run(conflictTransaction()),
    );

    const result = await updateWikiPage({
      pageId: PAGE_ID,
      title: "Submitted",
      icon: null,
      content: CONTENT,
      parentId: null,
      expectedVersion: 1,
      expectedContentGeneration: 0,
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      baseTitle: "Base",
      baseIcon: null,
      baseContent: BASE_CONTENT,
      baseParentId: null,
    });

    expect(result).toBe(latest);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("wiki-pages", "max");
  });
});
