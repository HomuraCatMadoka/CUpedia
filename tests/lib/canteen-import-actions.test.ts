import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockRedirect,
  mockGetSession,
  mockDbQueryUsers,
  mockDbQueryCanteens,
  mockDbQueryMenuImportDrafts,
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
  mockDbQueryMenuImportDrafts: { findFirst: vi.fn() },
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
      menuImportDrafts: mockDbQueryMenuImportDrafts,
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
import { resetCanteenMockState, mockListMenuItems } from "@/lib/canteen-mock";

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

  it("rejects unsupported image types before OCR", async () => {
    mockAdminSession();
    await expect(
      startMenuImportFromImage(
        CANTEEN_ID,
        Buffer.from("x"),
        "menu.gif",
        "image/gif",
      ),
    ).rejects.toThrow("INVALID_IMAGE_TYPE");
  });

  it("rejects when hourly OCR rate limit is exceeded", async () => {
    const prevLimit = process.env.CANTEEN_OCR_RATE_LIMIT_PER_HOUR;
    process.env.CANTEEN_OCR_RATE_LIMIT_PER_HOUR = "1";
    try {
      mockAdminSession();
      await startMenuImportFromImage(
        CANTEEN_ID,
        Buffer.from("x"),
        "menu.jpg",
        "image/jpeg",
      );
      await expect(
        startMenuImportFromImage(
          CANTEEN_ID,
          Buffer.from("x"),
          "menu2.jpg",
          "image/jpeg",
        ),
      ).rejects.toThrow("OCR_RATE_LIMIT_EXCEEDED");
    } finally {
      process.env.CANTEEN_OCR_RATE_LIMIT_PER_HOUR = prevLimit;
    }
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

  it("lets admin add rows after OCR failure and publish to menu", async () => {
    mockAdminSession();
    setOcrProviderForTests(createFailingOcrProvider("OCR_EMPTY_RESULT"));
    const draft = await startMenuImportFromImage(
      CANTEEN_ID,
      Buffer.from("x"),
      "menu.jpg",
      "image/jpeg",
    );
    expect(draft.status).toBe("failed");

    await updateMenuImportDraft(CANTEEN_ID, draft.id, [
      {
        tempId: "manual-1",
        name: "手工补录菜品",
        price: 16,
        mealPeriod: "breakfast",
        sortOrder: 0,
      },
    ]);
    await publishMenuImportDraft(CANTEEN_ID, draft.id);

    const menu = mockListMenuItems(CANTEEN_ID);
    expect(menu.some((item) => item.name === "手工补录菜品")).toBe(true);
    expect(
      menu.find((item) => item.name === "手工补录菜品")?.mealPeriod,
    ).toBe("breakfast");
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

    const menu = mockListMenuItems(CANTEEN_ID);
    expect(menu.some((item) => item.id === created[0].id)).toBe(true);

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

describe("canteen-import-actions (database mode)", () => {
  const prevMock = process.env.CANTEEN_MOCK_DATA;
  const prevE2e = process.env.E2E_TEST;

  beforeEach(() => {
    process.env.CANTEEN_MOCK_DATA = "false";
    process.env.E2E_TEST = "1";
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
    process.env.E2E_TEST = prevE2e;
    resetOcrRateLimitForTests();
    setOcrProviderForTests(null);
  });

  it("inserts ready draft through db without object storage upload", async () => {
    mockAdminSession();
    mockDbQueryCanteens.findFirst.mockResolvedValue({ id: "canteen-db-1" });
    const now = new Date();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "draft-db-1",
        canteenId: "canteen-db-1",
        sourceImageUrl: "mock://menu-import/menu.jpg",
        ocrRawText: "导入菜品甲 15元\n导入菜品乙 20",
        items: [
          {
            tempId: "row-0",
            name: "导入菜品甲",
            price: 15,
            mealPeriod: "lunch",
            sortOrder: 0,
          },
        ],
        status: "ready",
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockDbInsert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning }) });

    const draft = await startMenuImportFromImage(
      "canteen-db-1",
      Buffer.from("x"),
      "menu.jpg",
      "image/jpeg",
    );

    expect(draft.id).toBe("draft-db-1");
    expect(draft.status).toBe("ready");
    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("inserts failed draft when OCR fails", async () => {
    mockAdminSession();
    mockDbQueryCanteens.findFirst.mockResolvedValue({ id: "canteen-db-1" });
    setOcrProviderForTests(createFailingOcrProvider("OCR_EMPTY_RESULT"));
    const now = new Date();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "draft-db-fail",
        canteenId: "canteen-db-1",
        sourceImageUrl: "mock://menu-import/menu.jpg",
        ocrRawText: null,
        items: [],
        status: "failed",
        errorMessage: "OCR_EMPTY_RESULT",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockDbInsert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning }) });

    const draft = await startMenuImportFromImage(
      "canteen-db-1",
      Buffer.from("x"),
      "menu.jpg",
      "image/jpeg",
    );

    expect(draft.status).toBe("failed");
    expect(draft.errorMessage).toBe("OCR_EMPTY_RESULT");
  });
});
