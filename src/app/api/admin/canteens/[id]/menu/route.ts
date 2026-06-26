import { NextRequest, NextResponse } from "next/server";
import { getCanteenById, getCanteenMenuItems } from "@/lib/canteen-actions";
import { createMenuItem } from "@/lib/canteen-admin-actions";
import { getAdminUserForApi } from "@/lib/auth-guard";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = body as {
    name?: unknown;
    price?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  };
  if (input.name === undefined) {
    return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  }
  try {
    const item = await createMenuItem(id, {
      name: input.name,
      price: input.price,
      mealPeriod: input.mealPeriod,
      sortOrder: input.sortOrder,
      svgKey: input.svgKey,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    if (message === "CANTEEN_NOT_FOUND" || message === "MENU_ITEM_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.startsWith("INVALID_")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw e;
  }
}
