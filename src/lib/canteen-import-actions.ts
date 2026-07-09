"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { canteens, menuImportDrafts } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { createMenuItem } from "@/lib/canteen-admin-actions";
import {
  assertMenuImportImageSize,
  isAllowedMenuImportType,
} from "@/lib/canteen-import-image";
import { checkOcrRateLimit } from "@/lib/canteen-import-rate-limit";
import { parseOcrTextToDraftItems } from "@/lib/canteen-menu-parser";
import {
  isCanteenMockMode,
  mockCreateMenuImportDraft,
  mockDeleteMenuImportDraft,
  mockGetCanteen,
  mockGetMenuImportDraft,
  mockPublishMenuImportDraft,
  mockUpdateMenuImportDraft,
} from "@/lib/canteen-mock";
import { getOcrProvider } from "@/lib/canteen-ocr-provider";
import type { CanteenMenuItem, MenuImportDraft } from "@/lib/canteen-types";
import { validateMenuImportDraftItems } from "@/lib/canteen-types";
import { uploadFile } from "@/lib/minio";

function revalidateCanteenPaths(canteenId: string) {
  revalidatePath("/admin/canteens");
  revalidatePath(`/admin/canteens/${canteenId}`);
  revalidatePath(`/api/admin/canteens/${canteenId}/menu`);
  revalidatePath(`/api/canteens/${canteenId}/menu`);
  revalidatePath(`/canteen/${canteenId}`);
}

async function assertCanteenExists(canteenId: string): Promise<void> {
  if (isCanteenMockMode()) {
    if (!mockGetCanteen(canteenId)) throw new Error("CANTEEN_NOT_FOUND");
    return;
  }
  const row = await db.query.canteens.findFirst({
    where: eq(canteens.id, canteenId),
    columns: { id: true },
  });
  if (!row) throw new Error("CANTEEN_NOT_FOUND");
}

function mapDraftRow(row: typeof menuImportDrafts.$inferSelect): MenuImportDraft {
  return {
    id: row.id,
    canteenId: row.canteenId,
    sourceImageUrl: row.sourceImageUrl,
    ocrRawText: row.ocrRawText,
    items: row.items,
    status: row.status as MenuImportDraft["status"],
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getMenuImportDraft(
  canteenId: string,
  draftId: string,
): Promise<MenuImportDraft | null> {
  await requireAdmin();
  if (isCanteenMockMode()) return mockGetMenuImportDraft(canteenId, draftId);

  const row = await db.query.menuImportDrafts.findFirst({
    where: and(
      eq(menuImportDrafts.id, draftId),
      eq(menuImportDrafts.canteenId, canteenId),
    ),
  });
  return row ? mapDraftRow(row) : null;
}

export async function startMenuImportFromImage(
  canteenId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<MenuImportDraft> {
  const admin = await requireAdmin();
  await assertCanteenExists(canteenId);
  assertMenuImportImageSize(buffer.byteLength);
  if (!isAllowedMenuImportType(mimeType)) {
    throw new Error("INVALID_IMAGE_TYPE");
  }
  if (!checkOcrRateLimit(admin.id)) {
    throw new Error("OCR_RATE_LIMIT_EXCEEDED");
  }

  const skipObjectStorage =
    isCanteenMockMode() || process.env.E2E_TEST === "1";
  const sourceImageUrl = skipObjectStorage
    ? `mock://menu-import/${filename}`
    : await uploadFile(buffer, filename, mimeType);

  const ocr = await getOcrProvider().recognize(buffer, mimeType);
  if (!ocr.ok) {
    if (isCanteenMockMode()) {
      const draft = mockCreateMenuImportDraft({
        canteenId,
        sourceImageUrl,
        ocrRawText: null,
        items: [],
        status: "failed",
        errorMessage: ocr.error,
      });
      revalidateCanteenPaths(canteenId);
      return draft;
    }

    const [row] = await db
      .insert(menuImportDrafts)
      .values({
        canteenId,
        sourceImageUrl,
        ocrRawText: null,
        items: [],
        status: "failed",
        errorMessage: ocr.error,
      })
      .returning();
    revalidateCanteenPaths(canteenId);
    return mapDraftRow(row);
  }

  const items = parseOcrTextToDraftItems(ocr.text);
  if (isCanteenMockMode()) {
    const draft = mockCreateMenuImportDraft({
      canteenId,
      sourceImageUrl,
      ocrRawText: ocr.text,
      items,
      status: "ready",
    });
    revalidateCanteenPaths(canteenId);
    return draft;
  }

  const [row] = await db
    .insert(menuImportDrafts)
    .values({
      canteenId,
      sourceImageUrl,
      ocrRawText: ocr.text,
      items,
      status: "ready",
    })
    .returning();
  revalidateCanteenPaths(canteenId);
  return mapDraftRow(row);
}

export async function updateMenuImportDraft(
  canteenId: string,
  draftId: string,
  itemsInput: unknown,
): Promise<MenuImportDraft> {
  await requireAdmin();
  const items = validateMenuImportDraftItems(itemsInput);
  const existing = await getMenuImportDraft(canteenId, draftId);
  if (!existing) throw new Error("IMPORT_DRAFT_NOT_FOUND");
  if (existing.status === "published") {
    throw new Error("IMPORT_DRAFT_ALREADY_PUBLISHED");
  }

  if (isCanteenMockMode()) {
    const draft = mockUpdateMenuImportDraft(canteenId, draftId, items);
    revalidateCanteenPaths(canteenId);
    return draft;
  }

  const [row] = await db
    .update(menuImportDrafts)
    .set({ items, status: "ready", errorMessage: null, updatedAt: new Date() })
    .where(
      and(
        eq(menuImportDrafts.id, draftId),
        eq(menuImportDrafts.canteenId, canteenId),
      ),
    )
    .returning();

  if (!row) throw new Error("IMPORT_DRAFT_NOT_FOUND");
  revalidateCanteenPaths(canteenId);
  return mapDraftRow(row);
}

export async function publishMenuImportDraft(
  canteenId: string,
  draftId: string,
): Promise<CanteenMenuItem[]> {
  await requireAdmin();
  const draft = await getMenuImportDraft(canteenId, draftId);
  if (!draft) throw new Error("IMPORT_DRAFT_NOT_FOUND");
  if (draft.status === "published") throw new Error("IMPORT_DRAFT_ALREADY_PUBLISHED");
  if (draft.items.length === 0) throw new Error("IMPORT_DRAFT_EMPTY");

  if (isCanteenMockMode()) {
    const created = mockPublishMenuImportDraft(canteenId, draftId);
    revalidateCanteenPaths(canteenId);
    return created;
  }

  const created: CanteenMenuItem[] = [];
  for (const item of draft.items) {
    const row = await createMenuItem(canteenId, {
      name: item.name,
      price: item.price,
      mealPeriod: item.mealPeriod,
      sortOrder: item.sortOrder,
    });
    created.push(row);
  }

  await db
    .update(menuImportDrafts)
    .set({ status: "published", updatedAt: new Date() })
    .where(
      and(
        eq(menuImportDrafts.id, draftId),
        eq(menuImportDrafts.canteenId, canteenId),
      ),
    );

  revalidateCanteenPaths(canteenId);
  return created;
}

export async function deleteMenuImportDraft(
  canteenId: string,
  draftId: string,
): Promise<void> {
  await requireAdmin();
  if (isCanteenMockMode()) {
    mockDeleteMenuImportDraft(canteenId, draftId);
    revalidateCanteenPaths(canteenId);
    return;
  }

  const result = await db
    .delete(menuImportDrafts)
    .where(
      and(
        eq(menuImportDrafts.id, draftId),
        eq(menuImportDrafts.canteenId, canteenId),
      ),
    )
    .returning({ id: menuImportDrafts.id });

  if (!result[0]) throw new Error("IMPORT_DRAFT_NOT_FOUND");
  revalidateCanteenPaths(canteenId);
}
