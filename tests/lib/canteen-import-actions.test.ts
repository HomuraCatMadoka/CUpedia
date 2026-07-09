import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockRedirect,
  mockGetSession,
  mockDbQueryUsers,
  mockDbQueryCanteens,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
  mockDbSelect,
  mockRevalidatePath,
  mockUploadFile,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetSession: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
  mockDbQueryCanteens: { findFirst: vi.fn() },
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbSelect: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockUploadFile: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (opts: unknown) => mockGetSession(opts),
    },
  },
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      users: mockDbQueryUsers,
      canteens: mockDbQueryCanteens,
      menuImportDrafts: { findFirst: vi.fn() },
    },
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/lib/minio", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

import {
  createStaticOcrProvider,
  createFailingOcrProvider,
  setOcrProviderForTests,
} from "@/lib/canteen-ocr-provider";
import { resetOcrRateLimitForTests } from "@/lib/canteen-import-rate-limit";
import {
  deleteMenuImportDraft,
  publishMenuImportDraft,
  startMenuImportFromImage,
  updateMenuImportDraft,
} from "@/lib/canteen-import-actions";
import { resetCanteenMockState } from "@/lib/canteen-mock";

const CANTEEN_ID = "mock-canteen-demo";

function mockAdminSession() {
  mockGetSession.mockResolvedValue({
    user: { id: "admin-1", email: "admin@test.com" },
  });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id: "admin-1",
    email: "admin@test.com",
    nickname: "Admin",
    role: "admin",
    banned: false,
  });
}

describe("canteen-import-actions (mock mode)", () => {
  const prevMock = process.env.CANTEEN_MOCK_DATA;

  beforeEach(() => {
    process.env.CANTEEN_MOCK_DATA = "true";
    resetCanteenMockState();
    resetOcrRateLimitForTests();
    setOcrProviderForTests(
      createStaticOcrProvider("导入菜品甲 15元\n导入菜品乙 20"),
    );
    mockGetSession.mockResolvedValue(null);
    mockDbQueryUsers.findFirst.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.CANTEEN_MOCK_DATA = prevMock;
    resetCanteenMockState();
    resetOcrRateLimitForTests();
    setOcrProviderForTests(null);
  });

  it("creates draft from OCR text", async () => {
    mockAdminSession();
    const buffer = Buffer.from("fake-image");
    const draft = await startMenuImportFromImage(
      CANTEEN_ID,
      buffer,
      "menu.jpg",
      "image/jpeg",
    );
    expect(draft.status).toBe("ready");
    expect(draft.items).toHaveLength(2);
    expect(draft.items[0].name).toBe("导入菜品甲");
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("rejects anonymous import", async () => {
    const buffer = Buffer.from("fake-image");
    await expect(
      startMenuImportFromImage(CANTEEN_ID, buffer, "menu.jpg", "image/jpeg"),
    ).rejects.toThrow("NEXT_REDIRECT");
  });

  it("rejects oversized image before OCR", async () => {
    mockAdminSession();
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(
      startMenuImportFromImage(CANTEEN_ID, huge, "menu.jpg", "image/jpeg"),
    ).rejects.toThrow("IMAGE_TOO_LARGE");
  });

  it("creates failed draft when OCR fails", async () => {
    mockAdminSession();
    setOcrProviderForTests(createFailingOcrProvider("OCR_QUOTA_EXCEEDED"));
    const draft = await startMenuImportFromImage(
      CANTEEN_ID,
      Buffer.from("x"),
      "menu.jpg",
      "image/jpeg",
    );
    expect(draft.status).toBe("failed");
    expect(draft.errorMessage).toBe("OCR_QUOTA_EXCEEDED");
    expect(draft.items).toHaveLength(0);
  });

  it("updates draft items and publishes to menu", async () => {
    mockAdminSession();
    const draft = await startMenuImportFromImage(
      CANTEEN_ID,
      Buffer.from("x"),
      "menu.jpg",
      "image/jpeg",
    );
    const updated = await updateMenuImportDraft(CANTEEN_ID, draft.id, [
      {
        tempId: "row-1",
        name: "校对后菜品",
        price: 30,
        mealPeriod: "dinner",
        sortOrder: 0,
      },
    ]);
    expect(updated.items[0].mealPeriod).toBe("dinner");

    const created = await publishMenuImportDraft(CANTEEN_ID, draft.id);
    expect(created).toHaveLength(1);
    expect(created[0].name).toBe("校对后菜品");
    expect(created[0].mealPeriod).toBe("dinner");

    await expect(
      publishMenuImportDraft(CANTEEN_ID, draft.id),
    ).rejects.toThrow("IMPORT_DRAFT_ALREADY_PUBLISHED");
  });

  it("deletes draft", async () => {
    mockAdminSession();
    const draft = await startMenuImportFromImage(
      CANTEEN_ID,
      Buffer.from("x"),
      "menu.jpg",
      "image/jpeg",
    );
    await deleteMenuImportDraft(CANTEEN_ID, draft.id);
    await expect(
      updateMenuImportDraft(CANTEEN_ID, draft.id, draft.items),
    ).rejects.toThrow("IMPORT_DRAFT_NOT_FOUND");
  });
});
