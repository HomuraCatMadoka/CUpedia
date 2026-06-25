import { NextRequest, NextResponse } from "next/server";
import { deleteMenuItem, updateMenuItem } from "@/lib/canteen-admin-actions";
import { getAdminUserForApi } from "@/lib/auth-guard";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, itemId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const item = await updateMenuItem(
      id,
      itemId,
      body as {
        name?: unknown;
        price?: unknown;
        mealPeriod?: unknown;
        sortOrder?: unknown;
        svgKey?: unknown;
      },
    );
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    if (message === "MENU_ITEM_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.startsWith("INVALID_")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, itemId } = await context.params;
  try {
    await deleteMenuItem(id, itemId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    if (message === "MENU_ITEM_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    throw e;
  }
}
