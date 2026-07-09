import { NextRequest, NextResponse } from "next/server";
import { getAdminUserForApi } from "@/lib/auth-guard";
import { startMenuImportFromImage } from "@/lib/canteen-import-actions";
import {
  assertMenuImportImageSize,
  MENU_IMPORT_MAX_IMAGE_BYTES,
} from "@/lib/canteen-import-image";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: canteenId } = await context.params;
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }

  if (file.size > MENU_IMPORT_MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "IMAGE_TOO_LARGE" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    assertMenuImportImageSize(buffer.byteLength);
  } catch (e) {
    const message = e instanceof Error ? e.message : "IMAGE_TOO_LARGE";
    if (message === "IMAGE_TOO_LARGE") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw e;
  }

  try {
    const draft = await startMenuImportFromImage(
      canteenId,
      buffer,
      file.name,
      file.type,
    );
    return NextResponse.json({ draft }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    if (message === "CANTEEN_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message === "IMAGE_TOO_LARGE" ||
      message === "INVALID_IMAGE_TYPE" ||
      message === "OCR_RATE_LIMIT_EXCEEDED"
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw e;
  }
}
