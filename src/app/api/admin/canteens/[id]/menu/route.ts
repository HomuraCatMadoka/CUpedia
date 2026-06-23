import { NextRequest, NextResponse } from "next/server";
import { getCanteenMenuItems } from "@/lib/canteen-actions";
import { createMenuItem } from "@/lib/canteen-admin-actions";
import { requireAdminApi } from "@/lib/admin-api";
import { getCanteenById } from "@/lib/canteen-actions";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const canteen = await getCanteenById(id);
  if (!canteen) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const items = await getCanteenMenuItems(id);
  return NextResponse.json({ items });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const item = await createMenuItem(id, body as Record<string, unknown>);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    if (message === "CANTEEN_NOT_FOUND" || message === "MENU_ITEM_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.startsWith("INVALID_")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw e;
  }
}
